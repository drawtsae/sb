const GB = 1024 ** 3;
const fmt = (bytes: number) => (bytes / GB).toFixed(2);

export function UsageBar({
  musicBytes,
  diskFreeBytes,
}: {
  musicBytes: number;
  diskFreeBytes: number | null;
}) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="usage">
      Nhạc: {fmt(musicBytes)} GB · Đĩa còn trống: {diskFreeBytes === null ? "—" : fmt(diskFreeBytes)} GB
    </p>
  );
}
