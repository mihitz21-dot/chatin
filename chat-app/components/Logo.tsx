import Image from "next/image";

export default function Logo({ size = 48 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/icons/logo.png"
        alt="CurhatIn logo"
        width={size}
        height={size}
        priority
      />
      <span className="text-xl font-bold text-green-700">CurhatIn</span>
    </div>
  );
}
