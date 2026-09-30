import Image from "next/image";

export function Logo({ size = 56 }: { size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt="Franck's Burger"
      width={size}
      height={size}
      priority
      className="select-none"
    />
  );
}
