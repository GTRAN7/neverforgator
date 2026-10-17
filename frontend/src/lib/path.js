// The walking path is just palace.spots in order. A spot with a fact has "hatched".
export const walkingPath = (palace) => palace.spots.map((spot, i) => ({ spot, number: i + 1 }));
export const hatchedPath = (palace) => walkingPath(palace).filter(({ spot }) => spot.fact);
export const placeName = (spot, number) => spot.label || `spot ${number}`;
