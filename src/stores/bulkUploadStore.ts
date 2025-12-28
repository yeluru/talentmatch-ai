import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UploadResult {
  fileName: string;
  status: 'pending' | 'parsing' | 'importing' | 'done' | 'error';
  error?: string;
  parsed?: {
    full_name?: string;
    current_title?: string;
    current_company?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin_url?: string;
    skills?: string[];
    ats_score?: number;
  };
  atsScore?: number;
}

interface BulkUploadState {
  uploadResults: UploadResult[];
  setUploadResults: (results: UploadResult[] | ((prev: UploadResult[]) => UploadResult[])) => void;
  clearResults: () => void;
  updateResult: (index: number, update: Partial<UploadResult>) => void;
}

export const useBulkUploadStore = create<BulkUploadState>()(
  persist(
    (set) => ({
      uploadResults: [],
      setUploadResults: (results) =>
        set((state) => ({
          uploadResults: typeof results === 'function' ? results(state.uploadResults) : results,
        })),
      clearResults: () => set({ uploadResults: [] }),
      updateResult: (index, update) =>
        set((state) => ({
          uploadResults: state.uploadResults.map((item, i) =>
            i === index ? { ...item, ...update } : item
          ),
        })),
    }),
    {
      name: 'bulk-upload-storage',
    }
  )
);
