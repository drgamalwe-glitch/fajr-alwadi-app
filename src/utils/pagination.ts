import type { KeyboardEvent, WheelEvent } from "react";

export function changePageByDelta(currentPage: number, totalPages: number, delta: number) {
  if (totalPages <= 1) return currentPage;
  return Math.min(totalPages - 1, Math.max(0, currentPage + delta));
}

export function handlePaginationWheel(
  event: WheelEvent<HTMLElement>,
  currentPage: number,
  totalPages: number,
  setPage: (page: number) => void,
) {
  if (event.deltaY > 0) {
    event.preventDefault();
    setPage(changePageByDelta(currentPage, totalPages, 1));
  } else if (event.deltaY < 0) {
    event.preventDefault();
    setPage(changePageByDelta(currentPage, totalPages, -1));
  }
}

export function handlePaginationKeyDown(
  event: KeyboardEvent<HTMLElement>,
  currentPage: number,
  totalPages: number,
  setPage: (page: number) => void,
) {
  if (event.key === "ArrowRight" || event.key === "PageDown") {
    event.preventDefault();
    setPage(changePageByDelta(currentPage, totalPages, 1));
  } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    setPage(changePageByDelta(currentPage, totalPages, -1));
  } else if (event.key === "Home") {
    event.preventDefault();
    setPage(0);
  } else if (event.key === "End") {
    event.preventDefault();
    setPage(Math.max(0, totalPages - 1));
  }
}
