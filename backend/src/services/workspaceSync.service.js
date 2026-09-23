import fs from "fs";
import path from "path";
import FileNode from "../models/file.model.js";
import Project from "../models/project.model.js";
import { env } from "../config/env.js";
import logger from "../utils/logger.js";

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next"]);

const resolveRelativePath = (node, nodeMap) => {
  if (node.relativePath) return node.relativePath;
  const parts = [node.name];
  let curr = node;
  while (curr.parentId && nodeMap.has(curr.parentId.toString())) {
    curr = nodeMap.get(curr.parentId.toString());
    parts.unshift(curr.name);
  }
  return parts.join("/");
};

export const syncDiskToDatabase = async (projectId) => {
  const project = await Project.findById(projectId).select("owner");
  if (!project) return;
  
  const projectDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString());
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  // Read all existing DB nodes
  const existingNodes = await FileNode.find({ project: projectId });
  const nodeMap = new Map();
  for (const node of existingNodes) {
    nodeMap.set(node._id.toString(), node);
  }

  const dbPaths = new Map(); // relativePath -> FileNode
  
  // Build lookup map and ensure relativePath is populated on all nodes
  for (const node of existingNodes) {
    const relPath = resolveRelativePath(node, nodeMap);
    if (!node.relativePath && relPath) {
      node.relativePath = relPath;
      await node.save();
    }
    dbPaths.set(relPath, node);
  }

  const diskPaths = new Set();

  const traverse = async (currentDir, parentPath = "", parentId = null) => {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      
      const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      diskPaths.add(relativePath);
      
      let node = dbPaths.get(relativePath);
      
      if (!node) {
        // File exists on disk but not in DB -> Create it
        const isFolder = entry.isDirectory();
        let content = "";
        
        if (!isFolder && entry.name.match(/\.(js|jsx|ts|tsx|py|html|css|json|md|txt|c|cpp|h|java)$/)) {
          try {
            content = fs.readFileSync(path.join(currentDir, entry.name), "utf-8");
          } catch(e) {}
        }

        node = await FileNode.create({
          project: projectId,
          name: entry.name,
          isFolder,
          parentId,
          relativePath,
          content: isFolder ? undefined : content
        });
        dbPaths.set(relativePath, node);
      } else {
        // Update content if it's a small text file
        if (!node.isFolder && entry.name.match(/\.(js|jsx|ts|tsx|py|html|css|json|md|txt|c|cpp|h|java)$/)) {
          try {
            const diskContent = fs.readFileSync(path.join(currentDir, entry.name), "utf-8");
            if (node.content !== diskContent) {
              node.content = diskContent;
              await node.save();
            }
          } catch(e) {}
        }
      }

      if (entry.isDirectory()) {
        await traverse(path.join(currentDir, entry.name), relativePath, node._id);
      }
    }
  };

  await traverse(projectDir);

  // If disk was completely empty but DB has nodes, populate disk from DB rather than wiping DB
  if (diskPaths.size === 0 && existingNodes.length > 0) {
    for (const [relPath, node] of dbPaths.entries()) {
      try {
        const fullDiskPath = path.join(projectDir, relPath);
        if (node.isFolder) {
          if (!fs.existsSync(fullDiskPath)) fs.mkdirSync(fullDiskPath, { recursive: true });
        } else {
          const parentDir = path.dirname(fullDiskPath);
          if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
          fs.writeFileSync(fullDiskPath, node.content || "", "utf-8");
        }
        diskPaths.add(relPath);
      } catch (err) {
        logger.error(`Error populating empty disk from DB node ${relPath}:`, err);
      }
    }
    return;
  }

  // If disk has active files, any DB node missing from disk was deleted from disk -> delete from DB
  for (const [relPath, node] of dbPaths.entries()) {
    if (!diskPaths.has(relPath)) {
      await FileNode.findByIdAndDelete(node._id);
    }
  }
};
