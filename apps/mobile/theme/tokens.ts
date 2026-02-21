export const colors = {
  primary: {
    50: '#E0F7FA',
    100: '#E0F7FA',
    200: '#B2EBF2',
    300: '#80DEEA',
    500: '#00BCD4',
    600: '#0097A7',
  },
  secondary: {
    100: '#FCE4EC',
    500: '#E91E63',
    600: '#C2185B',
  },
  tertiary: {
    100: '#FFF9C4',
    500: '#FFD600',
  },
  status: {
    backlog: '#9E9E9E',
    doing: '#00BCD4',
    waiting: '#FFD600',
    done: '#4CAF50',
  },
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },
  white: '#FFFFFF',
  black: '#000000',
  danger: '#F44336',
  success: '#4CAF50',
} as const;

export const typography = {
  fontFamily: {
    regular: 'Roboto_400Regular',
    medium: 'Roboto_500Medium',
    bold: 'Roboto_700Bold',
    black: 'Roboto_900Black',
  },
  fontSize: {
    xs: 10,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;

export const ACCENT_COLORS = [
  '#00BCD4', '#E91E63', '#FFD600', '#9C27B0', '#FF5722',
  '#4CAF50', '#2196F3', '#FF9800', '#795548', '#607D8B',
];

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  doing: 'Doing',
  waiting: 'Waiting',
  done: 'Done',
};
