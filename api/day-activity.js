export default async function handler(req, res) {
  // Allow cross-origin requests from your frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { username, date } = req.query;

  // Validate parameters passed from the frontend
  if (!username || !date) {
    return res.status(400).json({ error: 'Missing username or date parameters' });
  }

  // Retrieve the secure token from Vercel's Environment Variables
  const token = process.env.GITHUB_TOKEN;

  try {
    // Query GitHub's authenticated Search API for issues/PRs/commits by author & date
    const searchUrl = `https://api.github.com/search/issues?q=author:${username}+committer-date:${date}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'vnd.github+json',
        'User-Agent': 'Cosmic-3D-Globe'
      }
    });

    const data = await response.json();
    const activities = [];
    
    if (data.items) {
      data.items.forEach(item => {
        const repoName = item.repository_url.split('/repos/')[1];
        activities.push({
          title: item.title,
          url: item.html_url,
          repo: repoName,
          type: item.pull_request ? 'Pull Request' : 'Issue/Activity'
        });
      });
    }

    return res.status(200).json({ date, activities });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch from GitHub API' });
  }
}
