import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { ArrowLeft, Home } from "lucide-react";
import logo from "@/assets/logo.png";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="404 - Page Not Found"
        description="The page you are looking for doesn’t exist on TalentMatch AI."
        noIndex
      />

      <main className="min-h-screen flex items-center justify-center p-6">
        <section className="w-full max-w-lg">
          <div className="rounded-2xl border bg-card shadow-sm p-8">
            <header className="flex items-center justify-between gap-4">
              <Link to="/" className="flex items-center gap-3">
                <img src={logo} alt="TalentMatch AI" className="h-10 w-auto" />
              </Link>
              <span className="text-xs text-muted-foreground">Error 404</span>
            </header>

            <div className="mt-8">
              <h1 className="font-display text-3xl md:text-4xl font-bold">
                This page doesn’t exist
              </h1>
              <p className="mt-3 text-muted-foreground">
                We couldn’t find <span className="font-mono">{location.pathname}</span>.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button asChild>
                  <Link to="/">
                    <Home className="mr-2 h-4 w-4" />
                    Back to home
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => window.history.back()}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go back
                </Button>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            If you typed the address manually, please double-check it.
          </p>
        </section>
      </main>
    </div>
  );
};

export default NotFound;

