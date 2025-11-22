import { Scissors } from "lucide-react";

export const Logo = () => {
  return (
    <>
      <div className="flex items-center justify-center gap-4 bg-background-brand w-full p-3 rounded-b-lg">
        <div className="w-8 h-8 rounded flex items-center justify-center">
          <Scissors />
        </div>
        <span className="text-label-large-size text-amber-50 font-bold">
          BarberShop
        </span>
      </div>
    </>
  );
};
