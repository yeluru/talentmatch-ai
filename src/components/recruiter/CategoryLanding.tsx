import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { ArrowRight, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CategoryBlock = {
  title: string;
  description: string;
  /** Optional bullet points of what you can do / key benefits */
  details?: string[];
  href: string;
  icon: LucideIcon;
  /** Optional image URL for the card (e.g. Unsplash). Renders above content when set. */
  image?: string;
};

export type CategoryLandingConfig = {
  title: string;
  description: string;
  blocks: CategoryBlock[];
};

interface CategoryLandingProps {
  config: CategoryLandingConfig;
}

export function CategoryLanding({ config }: CategoryLandingProps) {
  const navigate = useNavigate();
  const { title, description, blocks } = config;
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const markImageFailed = useCallback((url: string) => {
    setFailedImages((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
  }, []);
  const n = blocks.length;
  const cols =
    n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 4 : 3;

  return (
    <DashboardLayout>
      <div className="w-full min-w-0 space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-smmax-w-2xl">{description}</p>
        </header>

        {/* Full-width grid: stretches to fill all horizontal space */}
        <div
          className={cn(
            'grid w-full min-w-0 gap-5',
            cols === 1 && 'grid-cols-1',
            cols === 2 && 'grid-cols-1 sm:grid-cols-2',
            cols === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            cols === 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          )}
        >
          {blocks.map((block) => {
            const Icon = block.icon;
            return (
              <button
                key={block.href}
                type="button"
                onClick={() => navigate(block.href)}
                className={cn(
                  'group text-left rounded-xl border border-border bg-card overflow-hidden',
                  'hover:border-accent/40 hover:shadow-md',
                  'transition-all duration-150 flex flex-col min-h-0',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2',
                  'w-full'
                )}
              >
                {/* Image or icon visual — fills top of card; fallback to icon if image fails */}
                {block.image && !failedImages.has(block.image) ? (
                  <div className="relative w-full aspect-[2/1] bg-muted overflow-hidden shrink-0">
                    <img
                      src={block.image}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      onError={() => markImageFailed(block.image!)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-2 left-2 right-2 flex h-9 w-9 items-center justify-center rounded-lg bg-background/90 shadow-sm">
                      <Icon className="h-5 w-5 text-accent" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-[2/1] bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center shrink-0 group-hover:from-accent/10 group-hover:to-accent/5 transition-colors">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background/80 shadow-sm">
                      <Icon className="h-7 w-7 text-accent" />
                    </div>
                  </div>
                )}

                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-semibold text-foreground group-hover:text-accent transition-colors">
                    {block.title}
                  </h2>
                  <p className="mt-2 text-smleading-relaxed">
                    {block.description}
                  </p>
                  {block.details && block.details.length > 0 && (
                    <ul className="mt-3 space-y-1.5 flex-1">
                      {block.details.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Check className="h-4 w-4 shrink-0 text-accent/80 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <span className="mt-4 inline-flex items-center text-sm font-medium text-accent group-hover:underline">
                    Go to {block.title}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
