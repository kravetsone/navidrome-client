import type { Artist, Album } from "./subsonic";
import type { SubsonicClient } from "./subsonic/client";

// Navidrome (and some other Subsonic servers) populate `artist.coverArt`
// with a self-pointer — either the raw artist id or the "ar-<id>" form —
// which routes to a getCoverArt endpoint that returns an un-erroring
// placeholder when no metadata agent (Last.fm/Spotify) is configured. The
// <img> never fires onError, so the broken avatar sticks. Treat those ids
// as absent so the cascade to album covers can run.
export function isArtistSelfCover(
	coverArt: string | undefined,
	artistId: string,
): boolean {
	if (!coverArt) return true;
	if (coverArt === artistId) return true;
	if (coverArt === `ar-${artistId}`) return true;
	if (coverArt.startsWith("ar-")) return true;
	return false;
}

type ArtistLike = Pick<Artist, "id" | "coverArt" | "artistImageUrl"> & {
	album?: Album[];
};

export function artistCoverUrl(
	client: SubsonicClient,
	artist: ArtistLike | undefined,
	size: number | undefined,
	albumFallback?: Album[],
): string | undefined {
	if (!artist) return undefined;
	if (artist.artistImageUrl) return artist.artistImageUrl;
	if (!isArtistSelfCover(artist.coverArt, artist.id)) {
		return client.coverArtUrl(artist.coverArt, size);
	}
	const albums = albumFallback ?? artist.album ?? [];
	const cover = albums.find((a) => a.coverArt)?.coverArt;
	if (cover) return client.coverArtUrl(cover, size);
	return undefined;
}
