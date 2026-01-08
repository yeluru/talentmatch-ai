import { SEOHead } from "@/components/SEOHead";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Terms of Service | TalentMatch" description="Terms of service for TalentMatch." />
      <Navbar />

      <main className="container mx-auto px-4 pt-28 pb-16">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Terms of Service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              This is a placeholder terms page for local development. Replace this content before production.
            </p>
            <p>
              Use of the service is subject to your organization’s authorization, acceptable use policies, and applicable law.
            </p>
            <p>
              The service is provided “as is” without warranties. Liability limits and support terms should be defined prior to production
              launch.
            </p>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}


