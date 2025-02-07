import Image from "next/image";

export default function Loading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
      <Image
        src="/images/burungingcoinggif-ezgif.com-resize.gif"
        alt="Loading..."
        width={200} // Adjust the size as needed
        height={200}
        priority
      />
    </div>
  );
}
