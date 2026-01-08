import { SEOHead } from "@/components/SEOHead";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Privacy Policy | TalentMatch" description="Privacy policy for TalentMatch." />
      <Navbar />

      <main className="container mx-auto px-4 pt-28 pb-16">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              This is a placeholder privacy policy for local development. Replace this content before production.
            </p>
            <p>
              In general, we may process account information (email, name), application data, and usage analytics to provide and improve the
              service. We do not sell personal data.
            </p>
            <p>
              For questions or deletion requests, contact your organization administrator or platform support.
            </p>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}


