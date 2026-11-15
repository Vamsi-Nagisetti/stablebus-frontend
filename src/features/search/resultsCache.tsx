// Holds the latest bus-search response in memory so it doesn't have to be
// JSON-stringified into a route param and parsed again by the Results screen.
let latest: any = null;

export function setSearchResponse(response: any) {
  latest = response;
}

export function getSearchResponse(): any {
  return latest;
}