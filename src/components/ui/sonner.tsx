import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// Follows the system light/dark setting directly; this app has no theme switcher.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-foreground group-[.toaster]:text-background group-[.toaster]:border-0 group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg group-[.toaster]:font-sans",
          description: "group-[.toast]:text-background/70",
          actionButton:
            "group-[.toast]:!bg-transparent group-[.toast]:!text-brand-on-ink group-[.toast]:!font-bold group-[.toast]:!text-sm",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
