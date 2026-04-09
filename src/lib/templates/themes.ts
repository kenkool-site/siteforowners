import type { BusinessType, ColorTheme } from '@/lib/ai/types';

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
}

export interface ThemeConfig {
  id: ColorTheme;
  name: string;
  colors: ThemeColors;
  previewSwatch: [string, string, string]; // 3 colors shown in picker
}

export const THEMES_BY_VERTICAL: Record<BusinessType, ThemeConfig[]> = {
  salon: [
    {
      id: 'salon_gold',
      name: 'Gold & Cream',
      colors: {
        primary: '#B8860B',
        secondary: '#FFFDD0',
        accent: '#DAA520',
        background: '#FFF8F0',
        foreground: '#2D2017',
        muted: '#F5E6D3',
      },
      previewSwatch: ['#B8860B', '#FFFDD0', '#FFF8F0'],
    },
    {
      id: 'salon_rose',
      name: 'Rose & Blush',
      colors: {
        primary: '#C48B9F',
        secondary: '#F8E8EE',
        accent: '#D4A0A0',
        background: '#FFF5F7',
        foreground: '#3D2B2B',
        muted: '#F5E0E7',
      },
      previewSwatch: ['#C48B9F', '#F8E8EE', '#FFF5F7'],
    },
    {
      id: 'salon_mocha',
      name: 'Mocha & Earth',
      colors: {
        primary: '#6B4226',
        secondary: '#D4B896',
        accent: '#8B6914',
        background: '#FAF6F1',
        foreground: '#2C1810',
        muted: '#E8DDD0',
      },
      previewSwatch: ['#6B4226', '#D4B896', '#FAF6F1'],
    },
  ],
  barbershop: [
    {
      id: 'barbershop_black_gold',
      name: 'Black & Gold',
      colors: {
        primary: '#D4AF37',
        secondary: '#1A1A1A',
        accent: '#FFD700',
        background: '#0D0D0D',
        foreground: '#F5F5F5',
        muted: '#2A2A2A',
      },
      previewSwatch: ['#D4AF37', '#1A1A1A', '#0D0D0D'],
    },
    {
      id: 'barbershop_navy',
      name: 'Navy & Silver',
      colors: {
        primary: '#1B3A5C',
        secondary: '#C0C0C0',
        accent: '#4A90D9',
        background: '#F0F4F8',
        foreground: '#0D1B2A',
        muted: '#D6E4F0',
      },
      previewSwatch: ['#1B3A5C', '#C0C0C0', '#F0F4F8'],
    },
    {
      id: 'barbershop_forest',
      name: 'Forest & Tan',
      colors: {
        primary: '#2D5016',
        secondary: '#D2B48C',
        accent: '#4A7C23',
        background: '#F5F2EB',
        foreground: '#1A2E0A',
        muted: '#E0D8C8',
      },
      previewSwatch: ['#2D5016', '#D2B48C', '#F5F2EB'],
    },
  ],
  restaurant: [
    {
      id: 'restaurant_burgundy',
      name: 'Burgundy & Cream',
      colors: {
        primary: '#722F37',
        secondary: '#FFFDD0',
        accent: '#A0522D',
        background: '#FFF8F0',
        foreground: '#2C1018',
        muted: '#F2E0D0',
      },
      previewSwatch: ['#722F37', '#FFFDD0', '#FFF8F0'],
    },
    {
      id: 'restaurant_olive',
      name: 'Olive & Warm',
      colors: {
        primary: '#556B2F',
        secondary: '#F0E68C',
        accent: '#8B7D3C',
        background: '#FAFAF0',
        foreground: '#2A2E1A',
        muted: '#E8E4C8',
      },
      previewSwatch: ['#556B2F', '#F0E68C', '#FAFAF0'],
    },
    {
      id: 'restaurant_ocean',
      name: 'Ocean & Sand',
      colors: {
        primary: '#1E6091',
        secondary: '#F5DEB3',
        accent: '#2E86C1',
        background: '#FAF8F5',
        foreground: '#0A2E4A',
        muted: '#E0E8EF',
      },
      previewSwatch: ['#1E6091', '#F5DEB3', '#FAF8F5'],
    },
  ],
  nails: [
    {
      id: 'nails_pink',
      name: 'Pink & Lavender',
      colors: {
        primary: '#FF69B4',
        secondary: '#E6E6FA',
        accent: '#DA70D6',
        background: '#FFF5FA',
        foreground: '#4A1942',
        muted: '#F5E6F5',
      },
      previewSwatch: ['#FF69B4', '#E6E6FA', '#FFF5FA'],
    },
    {
      id: 'nails_coral',
      name: 'Coral & Mint',
      colors: {
        primary: '#FF7F50',
        secondary: '#98FFB3',
        accent: '#FF6347',
        background: '#F5FFFA',
        foreground: '#2D1A14',
        muted: '#E0F5E8',
      },
      previewSwatch: ['#FF7F50', '#98FFB3', '#F5FFFA'],
    },
    {
      id: 'nails_berry',
      name: 'Berry & Gold',
      colors: {
        primary: '#8B008B',
        secondary: '#FFD700',
        accent: '#C71585',
        background: '#FFF8F5',
        foreground: '#2D0A2D',
        muted: '#F0E0F0',
      },
      previewSwatch: ['#8B008B', '#FFD700', '#FFF8F5'],
    },
  ],
  braids: [
    {
      id: 'braids_kente',
      name: 'Kente Gold',
      colors: {
        primary: '#DAA520',
        secondary: '#228B22',
        accent: '#FF4500',
        background: '#FFF8E7',
        foreground: '#2A1F00',
        muted: '#F0E8C8',
      },
      previewSwatch: ['#DAA520', '#228B22', '#FFF8E7'],
    },
    {
      id: 'braids_royal',
      name: 'Royal Purple',
      colors: {
        primary: '#6A0DAD',
        secondary: '#FFD700',
        accent: '#9B59B6',
        background: '#FAF5FF',
        foreground: '#1A0030',
        muted: '#E8D5F5',
      },
      previewSwatch: ['#6A0DAD', '#FFD700', '#FAF5FF'],
    },
    {
      id: 'braids_earth',
      name: 'Earth & Terracotta',
      colors: {
        primary: '#A0522D',
        secondary: '#DEB887',
        accent: '#CD853F',
        background: '#FDF5E6',
        foreground: '#3E1A00',
        muted: '#E8D8C4',
      },
      previewSwatch: ['#A0522D', '#DEB887', '#FDF5E6'],
    },
  ],
};
