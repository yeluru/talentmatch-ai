import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  canonical?: string;
  noIndex?: boolean;
}

export function SEOHead({
  title = 'TalentMatch AI - AI-Powered Recruitment Platform',
  description = 'Transform your hiring process with AI-powered candidate matching, resume analysis, and intelligent talent sourcing. Find the perfect match faster.',
  keywords = 'recruitment, hiring, AI matching, talent sourcing, resume analysis, ATS, applicant tracking',
  ogImage = '/og-image.png',
  ogType = 'website',
  canonical,
  noIndex = false,
}: SEOHeadProps) {
  const fullTitle = title.includes('TalentMatch') ? title : `${title} | TalentMatch AI`;
  
  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      
      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:title" content={fullTitle} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={ogImage} />
      
      {/* Canonical URL */}
      {canonical && <link rel="canonical" href={canonical} />}
      
      {/* Robots */}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
    </Helmet>
  );
}
