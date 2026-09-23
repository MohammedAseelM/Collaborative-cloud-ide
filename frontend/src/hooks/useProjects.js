// src/hooks/useProjects.js
// Responsibility: Encapsulate project loading state, debouncing,
// creating, renaming, deleting, favoriting, archiving, sorting, and pagination.

import { useCallback, useEffect, useState } from "react";
import {
  fetchProjects,
  createProjectRequest,
  updateProjectRequest,
  deleteProjectRequest,
  toggleFavoriteRequest,
  toggleArchiveRequest,
} from "../services/project.service";

const SEARCH_DEBOUNCE_MS = 350;

export const useProjects = () => {
  const [projects, setProjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters & Sorting state
  const [favoriteFilter, setFavoriteFilter] = useState(false);
  const [archivedFilter, setArchivedFilter] = useState(false);
  const [sortBy, setSortBy] = useState("updatedAt");

  const loadProjects = useCallback(async (search, page, fav, arch, sort) => {
    setIsLoading(true);
    setError("");
    try {
      const data = await fetchProjects(search, page, 6, fav, arch, sort);
      setProjects(data.projects || []);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(data.currentPage || 1);
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to load projects. Try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reset page to 1 when search term or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, favoriteFilter, archivedFilter, sortBy]);

  // Debounce search, filters, and pagination triggers
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadProjects(searchTerm, currentPage, favoriteFilter, archivedFilter, sortBy);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, currentPage, favoriteFilter, archivedFilter, sortBy, loadProjects]);

  const createProject = async (payload) => {
    const data = await createProjectRequest(payload);
    loadProjects(searchTerm, currentPage, favoriteFilter, archivedFilter, sortBy);
    return data.project;
  };

  const renameProject = async (projectId, name) => {
    const data = await updateProjectRequest(projectId, { name });
    setProjects((prev) =>
      prev.map((project) =>
        project._id === projectId ? data.project : project
      )
    );
    return data.project;
  };

  const deleteProject = async (projectId) => {
    await deleteProjectRequest(projectId);
    loadProjects(searchTerm, currentPage, favoriteFilter, archivedFilter, sortBy);
  };

  const toggleFavorite = async (projectId) => {
    try {
      const data = await toggleFavoriteRequest(projectId);
      setProjects((prev) =>
        prev.map((project) =>
          project._id === projectId ? data.project : project
        )
      );
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  const toggleArchive = async (projectId) => {
    try {
      const data = await toggleArchiveRequest(projectId);
      // Since changing archive state shifts filters, reload list
      loadProjects(searchTerm, currentPage, favoriteFilter, archivedFilter, sortBy);
    } catch (err) {
      console.error("Failed to toggle archive:", err);
    }
  };

  return {
    projects,
    searchTerm,
    setSearchTerm,
    isLoading,
    error,
    currentPage,
    setCurrentPage,
    totalPages,
    favoriteFilter,
    setFavoriteFilter,
    archivedFilter,
    setArchivedFilter,
    sortBy,
    setSortBy,
    createProject,
    renameProject,
    deleteProject,
    toggleFavorite,
    toggleArchive,
    refresh: () => loadProjects(searchTerm, currentPage, favoriteFilter, archivedFilter, sortBy),
  };
};
