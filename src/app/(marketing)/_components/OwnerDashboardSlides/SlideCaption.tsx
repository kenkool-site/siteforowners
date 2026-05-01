export function SlideCaption({
  tag,
  title,
  desc,
}: {
  tag: string;
  title: string;
  desc: string;
}) {
  return (
    <footer className="border-t border-warm-cream1 px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-eyebrow">
        {tag}
      </p>
      <h3 className="mt-1 font-serif text-lg font-semibold text-warm-text">
        {title}
      </h3>
      <p className="mt-1 text-xs text-warm-textMuted">{desc}</p>
    </footer>
  );
}
