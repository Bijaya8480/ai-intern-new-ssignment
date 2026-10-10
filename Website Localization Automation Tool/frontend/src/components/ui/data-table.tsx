import { useState, useMemo, forwardRef, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Skeleton } from "./skeleton";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

export interface DataTableColumn<T> {
  key: string;
  label: ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  cell: (row: T, index: number) => ReactNode;
  enableSort?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  isLoading?: boolean;
  loadingRows?: number;
  sortField?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (field: string, order: "asc" | "desc") => void;
  showCheckbox?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  enableSelectAll?: boolean;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  emptyMessage?: string;
  className?: string;
  rowKey?: (row: T) => string;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  isLoading = false,
  loadingRows = 5,
  sortField,
  sortOrder = "asc",
  onSortChange,
  showCheckbox = false,
  selectedIds,
  onSelectionChange,
  enableSelectAll = false,
  pagination,
  emptyMessage = "No data to display.",
  className,
  rowKey = (r) => r.id,
}: DataTableProps<T>) {
  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable || !onSortChange) return;
    const nextOrder =
      sortField === col.key && sortOrder === "asc" ? "desc" : "asc";
    onSortChange(col.key, nextOrder);
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    onSelectionChange(checked ? new Set<string>(data.map(rowKey)) : new Set<string>());
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set<string>(selectedIds || new Set<string>());
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  };

  const allSelected =
    enableSelectAll &&
    data.length > 0 &&
    data.every((row) => selectedIds?.has(rowKey(row)));
  const someSelected =
    enableSelectAll &&
    selectedIds &&
    selectedIds.size > 0 &&
    !allSelected;

  const totalPages = pagination
    ? Math.ceil(pagination.total / pagination.pageSize)
    : 0;

  return (
    <div className={cn("overflow-hidden rounded-lg", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            {columns.map((col) => (
              <tr
                key={col.key}
                className="border-b border-border bg-muted/30"
              >
                {showCheckbox && col.key === "__checkbox__" && (
                  <th
                    className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase"
                    scope="col"
                  >
                    {enableSelectAll && !isLoading ? (
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) (el as any).indeterminate = someSelected;
                          }}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                      </div>
                    ) : (
                      <Skeleton className="h-4 w-4 rounded mx-auto" />
                    )}
                  </th>
                )}
                <th
                  className={cn(
                    "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",
                    col.sortable && "cursor-pointer select-none",
                    col.headerClassName
                  )}
                  onClick={() => handleSort(col)}
                >
                  <div
                    className={cn(
                      "flex items-center gap-1",
                      col.sortable && "hover:text-foreground transition-colors"
                    )}
                  >
                    {col.label}
                    {col.sortable && sortField === col.key && (
                      <span>
                        {sortOrder === "asc" ? (
                          <ChevronUp className="h-3 w-3 text-primary" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-primary" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(loadingRows)].map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center"
                >
                  <p className="text-sm text-muted-foreground">
                    {emptyMessage}
                  </p>
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    "border-b border-border transition-colors",
                    "hover:bg-muted/50",
                    selectedIds?.has(rowKey(row)) && "bg-muted/50"
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn("px-4 py-3 align-top", col.className)}
                    >
                      {col.key === "__checkbox__" && showCheckbox ? (
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={selectedIds?.has(rowKey(row))}
                            onChange={(e) =>
                              handleSelectRow(
                                rowKey(row),
                                e.target.checked
                              )
                            }
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                        </div>
                      ) : (
                        col.cell(row, index)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
