export interface Album {
	id: string;
	name: string;
	artist?: string;
	artistId?: string;
	coverArt?: string;
	songCount?: number;
	duration?: number;
	year?: number;
	genre?: string;
	created?: string;
	starred?: string;
	userRating?: number;
	playCount?: number;
}

export interface Artist {
	id: string;
	name: string;
	coverArt?: string;
	artistImageUrl?: string;
	albumCount?: number;
	starred?: string;
}

export interface ArtistIndex {
	name: string;
	artist: Artist[];
}

export interface Song {
	id: string;
	title: string;
	album?: string;
	albumId?: string;
	artist?: string;
	artistId?: string;
	coverArt?: string;
	duration?: number;
	track?: number;
	discNumber?: number;
	year?: number;
	genre?: string;
	size?: number;
	contentType?: string;
	suffix?: string;
	bitRate?: number;
	path?: string;
	starred?: string;
	userRating?: number;
}

export interface Playlist {
	id: string;
	name: string;
	comment?: string;
	owner?: string;
	public?: boolean;
	songCount?: number;
	duration?: number;
	created?: string;
	changed?: string;
	coverArt?: string;
}

export interface SearchResult {
	artist?: Artist[];
	album?: Album[];
	song?: Song[];
}

export interface LyricLine {
	/** milliseconds since song start; may be absent on unsynced lyrics */
	start?: number;
	value: string;
}

export type LyricsSource = "server" | "lrclib";

export interface StructuredLyrics {
	displayArtist?: string;
	displayTitle?: string;
	lang?: string;
	/** global timing offset in ms to apply to all line starts */
	offset?: number;
	synced: boolean;
	line: LyricLine[];
	/** Where the lyrics came from. "server" = Navidrome, "lrclib" = external LRCLIB fallback. */
	source?: LyricsSource;
}

export type AlbumListType =
	| "random"
	| "newest"
	| "frequent"
	| "recent"
	| "starred"
	| "alphabeticalByName"
	| "alphabeticalByArtist"
	| "byYear"
	| "byGenre"
	| "highest";
