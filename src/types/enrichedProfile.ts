export interface EnrichedProfile {
  linkedin_url: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  summary?: string;
  profile_pic_url?: string;
  
  // Location
  city?: string;
  state?: string;
  country?: string;
  
  // Current position
  current_title?: string;
  current_company?: string;
  current_company_logo?: string;
  
  // Education
  education_school?: string;
  education_degree?: string;
  education_field?: string;
  education_logo?: string;
  
  // Full arrays
  experiences: Experience[];
  education: Education[];
  skills: string[];
  certifications: Certification[];
  languages: string[];
  
  // Calculated
  years_of_experience: number;
  
  // Metadata
  enriched_at: string;
  raw_profile: any;
}

export interface Experience {
  title: string;
  company: string;
  company_linkedin_profile_url?: string;
  logo_url?: string;
  location?: string;
  description?: string;
  starts_at?: {
    year: number;
    month?: number;
    day?: number;
  };
  ends_at?: {
    year: number;
    month?: number;
    day?: number;
  } | null;
}

export interface Education {
  school: string;
  degree_name?: string;
  field_of_study?: string;
  logo_url?: string;
  starts_at?: {
    year: number;
    month?: number;
    day?: number;
  };
  ends_at?: {
    year: number;
    month?: number;
    day?: number;
  };
  activities_and_societies?: string;
  grade?: string;
}

export interface Certification {
  name: string;
  authority?: string;
  license_number?: string;
  display_source?: string;
  url?: string;
  starts_at?: {
    year: number;
    month?: number;
    day?: number;
  };
  ends_at?: {
    year: number;
    month?: number;
    day?: number;
  };
}
