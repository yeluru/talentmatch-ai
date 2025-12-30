import * as React from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ScrollToTopProps {
  threshold?: number;
  className?: string;
}

export function ScrollToTop({ threshold = 300, className }: ScrollToTopProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > threshold);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!isVisible) return null;

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={scrollToTop}
      className={cn(
        "fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg",
        "bg-primary text-primary-foreground hover:bg-primary/90",
        "animate-fade-in transition-all duration-200",
        className
      )}
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  );
}
