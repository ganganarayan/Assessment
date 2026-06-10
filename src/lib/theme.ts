export const THEME_COOKIE = "theme";
export type ThemePref = "light" | "dark" | "system";
export const THEME_OPTIONS: ThemePref[] = ["light", "dark", "system"];

/**
 * Runs before paint: reads the theme cookie and toggles the `dark` class on
 * <html> (resolving "system" via the OS preference) to avoid a flash.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]+)/);var t=m?m[1]:'system';var d=t==='dark'||((t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
