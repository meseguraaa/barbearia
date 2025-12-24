type CustomerLevel = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

type ResolveProductPriceInput = {
  productId: string;
  clientId: string | null;
  now: Date;
  timezone: string; // do tenant/unit
};

type ResolveProductPriceOutput = {
  unitPrice: number;
  appliedLevel: CustomerLevel;
  appliedBecause: "BIRTHDAY" | "LEVEL" | "BASE";
  birthdayWindow: boolean;
};
