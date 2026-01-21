
export const metadata = {
    title: 'EzyBot Embed',
    description: 'EzyBot Chat Widget',
};

export default function EmbedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="bg-transparent" suppressHydrationWarning>{children}</body>
        </html>
    );
}
