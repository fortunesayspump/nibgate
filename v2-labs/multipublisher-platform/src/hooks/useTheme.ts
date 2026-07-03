import { ThemeContext } from '@/contexts/ThemeContext';
import { useContext } from 'react';

export function useTheme() {
  const { theme, handleThemeChange } = useContext(ThemeContext);

  const switchTheme = () => {
    if (theme === 'light') return handleThemeChange('dark');
    if (theme === 'dark') return handleThemeChange('light');
    if (theme === 'system') return handleThemeChange('light');
    return undefined;
  };

  return { theme, switchTheme };
}
