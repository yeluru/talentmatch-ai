import { TableHead } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SortDir, SortState } from '@/lib/sort';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

type Props<K extends string> = {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onToggle: (key: K) => void;
  className?: string;
  title?: string;
};

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-4 w-4 opacity-50" />;
  return dir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
}

export function SortableTableHead<K extends string>({ label, sortKey, sort, onToggle, className, title }: Props<K>) {
  const active = sort.key === sortKey;
  const ariaSort: React.AriaAttributes['aria-sort'] = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <TableHead className={cn('p-0', className)} aria-sort={ariaSort} title={title}>
      <Button
        type="button"
        variant="ghost"
        className={cn('h-12 w-full justify-start px-4 font-medium hover:text-foreground')}
        onClick={() => onToggle(sortKey)}
      >
        <span className="mr-2">{label}</span>
        <SortIcon active={active} dir={sort.dir} />
      </Button>
    </TableHead>
  );
}

