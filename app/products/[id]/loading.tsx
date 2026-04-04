export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <p className="text-sm">Loading product...</p>
        </div>
      </div>
    </div>
  );
}
