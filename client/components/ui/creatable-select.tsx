import { useState, useRef, useEffect } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreatableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  onCreateNew?: (value: string) => Promise<void>;
  label?: string;
  required?: boolean;
}

export function CreatableSelect({
  value,
  onChange,
  options,
  placeholder = "Sélectionnez ou créez...",
  onCreateNew,
  label,
  required = false,
}: CreatableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtrer les options selon la recherche
  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(search.toLowerCase())
  );

  // Vérifier si la recherche correspond exactement à une option existante
  const exactMatch = options.some(
    (option) => option.toLowerCase() === search.toLowerCase()
  );

  // Fermer le dropdown quand on clique à l'extérieur
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearch("");
  };

  const handleCreate = async () => {
    if (!search.trim() || !onCreateNew) return;

    setIsCreating(true);
    try {
      await onCreateNew(search.trim());
      onChange(search.trim());
      setIsOpen(false);
      setSearch("");
    } catch (error: any) {
      console.error("Erreur lors de la création:", error);
      // L'erreur est déjà gérée dans la fonction onCreateNew avec toast
      // On ne fait rien ici pour éviter les doublons
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="text-xs font-medium">
          {label} {required && "*"}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={value || placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && search && !exactMatch && onCreateNew) {
              e.preventDefault();
              handleCreate();
            }
          }}
        />
        {value && !search && (
          <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
            <span className="text-sm">{value}</span>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredOptions.length > 0 ? (
            <div className="py-1">
              {filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between",
                    value === option && "bg-accent"
                  )}
                  onClick={() => handleSelect(option)}
                >
                  <span>{option}</span>
                  {value === option && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Aucun résultat
            </div>
          )}

          {/* Option pour créer un nouveau */}
          {search && !exactMatch && onCreateNew && (
            <div className="border-t">
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 text-primary font-medium"
                onClick={handleCreate}
                disabled={isCreating}
              >
                <Plus className="h-4 w-4" />
                {isCreating ? "Création..." : `Créer "${search}"`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
