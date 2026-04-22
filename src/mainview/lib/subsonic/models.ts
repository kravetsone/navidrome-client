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
