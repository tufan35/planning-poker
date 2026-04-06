import { RoomGame } from "@/components/game/RoomGame";

type PageProps = { params: Promise<{ roomId: string }> };

export default async function RoomPage({ params }: PageProps) {
  const { roomId } = await params;
  const decoded = decodeURIComponent(roomId);
  return <RoomGame roomId={decoded} />;
}
