export default function Placeholder({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-lg border p-10 text-center text-muted-foreground bg-muted/20">
      <div className="text-lg font-semibold text-foreground mb-1">{title}</div>
      <p className="text-sm">
        {description ?? "Aucune donnée pour cette période."}
      </p>
    </div>
  );
}
