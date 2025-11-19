import { Scissors } from "lucide-react";
import Link from "next/link";

export const Logo = () => {
  return (
    <Link
      href="/"
      className="flex items-center justify-center gap-4 bg-[#2e2c30] w-full p-3 rounded-b-lg"
    >
      <div className="w-8 h-8 bg-background-brand rounded flex items-center justify-center">
        <Scissors />
      </div>
      <span className="text-label-large-size text-content-brand font-bold">
        BarberShop
      </span>
    </Link>
  );
};
