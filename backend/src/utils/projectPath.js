import path from "path";

export function resolveProjectPath(projectRoot, relativePath) {
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, relativePath || "");
  const relative = path.relative(root, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    const error = new Error("Project file path is invalid");
    error.statusCode = 400;
    error.errorCode = "INVALID_PROJECT_PATH";
    throw error;
  }
  return target;
}
