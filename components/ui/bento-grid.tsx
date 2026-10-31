import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl grid-cols-1 gap-3 md:auto-rows-[19rem] md:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  style,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}) => {
  return (
    <div
      style={style}
      className={cn(
        "group/bento row-span-1 flex flex-col justify-between gap-4 overflow-hidden rounded-[28px] border border-line bg-card p-5 transition duration-300 hover:bg-white hover:shadow-[0_20px_50px_rgba(25,20,12,0.08)] md:p-6",
        className,
      )}
    >
      {header}
      <div className="transition duration-200 group-hover/bento:translate-x-1">
        {icon}
        <div className="mb-1 text-lg text-ink">
          {title}
        </div>
        <div className="text-[14px] leading-snug text-muted">
          {description}
        </div>
      </div>
    </div>
  );
};
