const { google } = require('googleapis');

/**
 * The one "tool" the agent can call. Runs a real Gmail search for
 * `keyword` in the subject line over the last `days` days and returns an
 * exact count (paginated, not the API's rougher resultSizeEstimate).
 */
async function searchGmailBySubject(oauth2Client, { keyword, days }) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const query = `subject:${keyword} newer_than:${days}d`;

  let count = 0;
  let pageToken;
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      pageToken,
      maxResults: 500
    });
    count += (res.data.messages || []).length;
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return { query, count };
}

module.exports = { searchGmailBySubject };
