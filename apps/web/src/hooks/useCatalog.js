import { useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client.js";
import { fetchCategories, fetchListing, fetchListings } from "../api/catalog.js";

function toMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 404) return { kind: "not-found", message: "Not found." };
    return { kind: "error", message: `API error (${error.status}). Please retry.` };
  }
  return { kind: "error", message: "Network error. Is the API running?" };
}

/** Categories for the homepage (loaded once). */
export function useCategories() {
  const [state, setState] = useState({ loading: true, error: null, data: [] });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: [] });
    fetchCategories()
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, ...toMessage(error), data: [] });
      });
    return () => {
      alive = false;
    };
  }, []);

  async function reload() {
    setState({ loading: true, error: null, data: [] });
    try {
      const data = await fetchCategories();
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState({ loading: false, ...toMessage(error), data: [] });
    }
  }

  return { ...state, reload };
}

/** Paginated listings; caller passes an already-debounced query. Null params = idle. */
export function useListings(params) {
  const [state, setState] = useState({
    loading: Boolean(params),
    error: null,
    items: [],
    total: 0,
  });
  const requestId = useRef(0);
  const key = params ? JSON.stringify(params) : null;

  useEffect(() => {
    if (key === null) {
      setState({ loading: false, error: null, items: [], total: 0 });
      return;
    }
    const current = ++requestId.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchListings(params)
      .then((data) => {
        if (requestId.current !== current) return; // stale response
        setState({ loading: false, error: null, items: data.items ?? [], total: data.total ?? 0 });
      })
      .catch((error) => {
        if (requestId.current !== current) return;
        setState({ loading: false, ...toMessage(error), items: [], total: 0 });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function reload() {
    if (key === null) return;
    const current = ++requestId.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetchListings(params);
      if (requestId.current === current) {
        setState({ loading: false, error: null, items: data.items ?? [], total: data.total ?? 0 });
      }
    } catch (error) {
      if (requestId.current === current) {
        setState({ loading: false, ...toMessage(error), items: [], total: 0 });
      }
    }
  }

  return { ...state, reload };
}

/** Single listing detail by id (null = idle). */
export function useListingDetail(id) {
  const [state, setState] = useState({ loading: Boolean(id), error: null, data: null });

  useEffect(() => {
    if (!id) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    let alive = true;
    setState({ loading: true, error: null, data: null });
    fetchListing(id)
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, ...toMessage(error), data: null });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  return state;
}
