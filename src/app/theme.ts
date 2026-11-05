// Map themes. The UI chrome follows the same theme through CSS variables (styles/main.css).
export interface Theme {
  id: 'dark' | 'light';
  dark: boolean;
  space: [string, string];        // background gradient (centre, edge)
  stars: number;                  // star density (0 = none)
  atmosphere: string;             // glow colour around the globe
  ocean: [string, string, string]; // light side, middle, limb
  land: string;                   // land when no filter colours it
  border: string;
  borderWidth: number;
  coast: string;
  graticule: string;
  lake: string;
  river: string;
  ice: string;
  label: string;
  labelHalo: string;
  labelMuted: string;
  sea: string;
  city: string;
  capital: string;
  selection: string;
  shade: number;                  // strength of the 3D limb shading on the globe
}

export const THEMES: Record<'dark' | 'light', Theme> = {
  dark: {
    id: 'dark', dark: true,
    space: ['#0b1730', '#02040b'],
    stars: 1,
    atmosphere: '#5fb4ff',
    ocean: ['#1d5f98', '#0f3d6e', '#071a33'],
    land: '#5b6f7f',
    border: 'rgba(255,255,255,0.62)',
    borderWidth: 0.7,
    coast: 'rgba(6,18,38,0.55)',
    graticule: 'rgba(170,210,255,0.13)',
    lake: '#16518a',
    river: 'rgba(110,180,240,0.85)',
    ice: '#eef4fa',
    label: '#ffffff',
    labelHalo: 'rgba(5,14,30,0.82)',
    labelMuted: '#cfe3ff',
    sea: 'rgba(170,215,255,0.72)',
    city: '#ffffff',
    capital: '#ff5a5f',
    selection: '#ffe066',
    shade: 0.42,
  },
  light: {
    id: 'light', dark: false,
    space: ['#f4f1ea', '#dcd6c8'],
    stars: 0,
    atmosphere: '#9fc6e8',
    ocean: ['#cfe9fb', '#a9d3f0', '#86bde3'],
    land: '#e9e2d0',
    border: 'rgba(70,60,50,0.55)',
    borderWidth: 0.7,
    coast: 'rgba(40,80,120,0.45)',
    graticule: 'rgba(40,80,130,0.12)',
    lake: '#a9d3f0',
    river: 'rgba(60,130,200,0.8)',
    ice: '#ffffff',
    label: '#1d2433',
    labelHalo: 'rgba(255,255,255,0.88)',
    labelMuted: '#3b4a63',
    sea: 'rgba(30,80,140,0.62)',
    city: '#1d2433',
    capital: '#d6283a',
    selection: '#e8590c',
    shade: 0.18,
  },
};
