import { Logo } from "../logo/logo";

export const Header = () => {
  return (
    <header className="fixed top-0 z-50 w-full bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <Logo />
    </header>
  );
};
