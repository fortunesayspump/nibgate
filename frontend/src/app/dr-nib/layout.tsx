import Header from "@/components/Header";
import DrNibShell from "@/components/dr-nib/DrNibShell";

export default function DrNibLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <DrNibShell>{children}</DrNibShell>
    </>
  );
}
