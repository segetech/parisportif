import type { RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scrollToTopOfList } from "@/lib/utils";

export function paginateItems<T>(
  items: T[],
  currentPage: number,
  pageSize: number,
): T[] {
  if (pageSize <= 0) return items;
  const safePage = Math.max(1, currentPage);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

interface TablePaginationFooterProps {
  totalItems: number;
  currentPage: number;
  pageSize: number; // 0 = Tout
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  itemLabel?: string;
  scrollAnchorRef?: RefObject<HTMLElement | null>;
  pageSizeOptions?: number[];
  className?: string;
}

export function TablePaginationFooter({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = "éléments",
  scrollAnchorRef,
  pageSizeOptions = [10, 25, 50, 100],
  className = "",
}: TablePaginationFooterProps) {
  if (totalItems === 0) return null;

  const isAll = pageSize <= 0;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = isAll ? 1 : (safePage - 1) * pageSize + 1;
  const endItem = isAll ? totalItems : Math.min(safePage * pageSize, totalItems);

  const goToPage = (nextPage: number) => {
    onPageChange(nextPage);
    scrollToTopOfList(scrollAnchorRef?.current);
  };

  return (
    <div
      className={`p-3 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground ${className}`}
    >
      <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
        <span>
          Affichage de{" "}
          <span className="font-medium text-foreground">{startItem}</span> à{" "}
          <span className="font-medium text-foreground">{endItem}</span> sur{" "}
          <span className="font-medium text-foreground">{totalItems}</span>{" "}
          {itemLabel}
        </span>

        <span className="text-border">|</span>

        <label className="flex items-center gap-1.5">
          <span>Lignes:</span>
          <select
            aria-label="Lignes par page"
            className="border border-border rounded px-1.5 py-0.5 bg-background text-foreground text-xs"
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
              scrollToTopOfList(scrollAnchorRef?.current);
            }}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            <option value={0}>Tout</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={isAll || safePage <= 1}
          onClick={() => goToPage(Math.max(1, safePage - 1))}
          className="h-7 px-2 text-xs gap-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Précédent</span>
        </Button>

        <span className="px-2 font-mono text-xs font-medium text-foreground">
          {isAll ? "Tout" : `Page ${safePage} / ${totalPages}`}
        </span>

        <Button
          variant="outline"
          size="sm"
          disabled={isAll || safePage >= totalPages}
          onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
          className="h-7 px-2 text-xs gap-1"
        >
          <span>Suivant</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
