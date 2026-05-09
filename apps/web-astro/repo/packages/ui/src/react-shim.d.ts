// Minimal React/JSX shims for build environments without @types/react.
// If you add @types/react to this package, remove this file to avoid conflicts.

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare namespace React {
  type ReactNode = any;
  type CSSProperties = Record<string, string | number | undefined>;
  type FC<P = {}> = (props: P & { children?: ReactNode }) => any;
  type FunctionComponent<P = {}> = FC<P>;

  interface HTMLAttributes<T> {
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
    [key: string]: any;
  }

  interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    disabled?: boolean;
    onClick?: any;
  }

  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    value?: any;
    onChange?: any;
  }

  interface Context<T> {
    Provider: any;
  }

  function createContext<T>(defaultValue: T): Context<T>;
  function useContext<T>(context: Context<T>): T;
  function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  function useState<T>(initial: T | (() => T)): [T, (value: T) => void];
}

declare module "react" {
  export = React;
  export as namespace React;
}

declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
