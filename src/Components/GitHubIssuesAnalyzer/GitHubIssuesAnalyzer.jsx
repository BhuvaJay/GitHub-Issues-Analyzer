import React, { useState } from 'react';
import { 
  Container, 
  Header, 
  Content, 
  Form, 
  ButtonToolbar, 
  Button, 
  Panel, 
  FlexboxGrid,
  Loader,
  Table,
  Modal,
  Divider
} from 'rsuite';
import 'rsuite/dist/rsuite.min.css';
import './GitHubIssuesAnalyzer.css';

const { Column, HeaderCell, Cell } = Table;

function GitHubIssuesAnalyzer() {
  const [repoPath, setRepoPath] = useState('');
  const [allIssues, setAllIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!repoPath || !repoPath.includes('/')) {
      setError('Please enter a valid repository in the format owner/repo');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const issues = await fetchAllIssues(repoPath);
      
      if (issues.length === 0) {
        setError('No issues found for this repository.');
        setLoading(false);
        return;
      }
      
      setAllIssues(issues);
      
      // Process data for metrics
      const statusCounts = getStatusCounts(issues);
      const weeklyData = processWeeklyData(issues);
      
      setAnalysisData({
        repoPath,
        statusCounts,
        weeklyData,
        averageClosureRate: calculateAverageClosureRate(weeklyData)
      });
      
    } catch (err) {
      console.error('Error:', err);
      setError(`Error fetching issues: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch all issues (up to 1000) for a repository
  const fetchAllIssues = async (repo) => {
    const issues = [];
    let page = 1;
    const perPage = 100; // GitHub API max per page
    const maxIssues = 1000;
    
    while (issues.length < maxIssues) {
      const url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=${perPage}&page=${page}`;
      console.log('url :>> ', url);
      const response = await fetch(url);
      console.log('response :>> ', response);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Repository not found');
        }
        throw new Error(`GitHub API returned ${response.status}`);
      }
      
      const data = await response.json();
      console.log('data :>> ', data);
      if (data.length === 0) {
        break; // No more issues to fetch
      }
      
      issues.push(...data);
      
      if (data.length < perPage) {
        break; // Last page has fewer items than perPage
      }
      
      page++;
      
      if (issues.length >= maxIssues) {
        break; // Reached max issues limit
      }
    }
    
    return issues.slice(0, maxIssues);
  };

  // Calculate status counts
  const getStatusCounts = (issues) => {
    const openIssues = issues.filter(issue => issue.state === 'open').length;
    const closedIssues = issues.filter(issue => issue.state === 'closed').length;
    
    return {
      open: openIssues,
      closed: closedIssues,
      total: issues.length
    };
  };

  // Process weekly data from issues
  const processWeeklyData = (issues) => {
    // Sort issues by creation date
    const sortedIssues = [...issues].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    // Get date range for last 10 weeks
    const today = new Date();
    const tenWeeksAgo = new Date();
    tenWeeksAgo.setDate(today.getDate() - 70); // 10 weeks × 7 days
    
    // Create weekly buckets for the last 10 weeks
    const weeklyData = [];
    for (let i = 0; i < 10; i++) {
      const weekStart = new Date(tenWeeksAgo);
      weekStart.setDate(weekStart.getDate() + (i * 7));
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      weeklyData.push({
        weekStart: new Date(weekStart),
        weekEnd: new Date(weekEnd),
        newIssues: 0,
        closedIssues: 0,
        openAtStart: 0
      });
    }
    
    // Count issues per week
    issues.forEach(issue => {
      const createdDate = new Date(issue.created_at);
      const closedDate = issue.closed_at ? new Date(issue.closed_at) : null;
      
      // Count new issues per week
      weeklyData.forEach(week => {
        if (createdDate >= week.weekStart && createdDate <= week.weekEnd) {
          week.newIssues++;
        }
        
        // Count closed issues per week
        if (closedDate && closedDate >= week.weekStart && closedDate <= week.weekEnd) {
          week.closedIssues++;
        }
        
        // Count issues open at the start of each week
        if (createdDate < week.weekStart && (!closedDate || closedDate >= week.weekStart)) {
          week.openAtStart++;
        }
      });
    });
    
    // Calculate closure rate and new/closed ratio for each week
    weeklyData.forEach(week => {
      const totalIssuesInWeek = week.openAtStart + week.newIssues;
      week.closureRate = totalIssuesInWeek > 0 ? (week.closedIssues / totalIssuesInWeek * 100) : 0;
      week.ratio = week.closedIssues > 0 ? week.newIssues / week.closedIssues : week.newIssues > 0 ? 'Infinity' : '0';
      week.weekLabel = `Week ${weeklyData.indexOf(week) + 1} (${formatDate(week.weekStart)} - ${formatDate(week.weekEnd)})`;
    });
    
    return weeklyData;
  };

  // Calculate average closure rate
  const calculateAverageClosureRate = (weeklyData) => {
    const totalClosureRate = weeklyData.reduce((sum, week) => sum + week.closureRate, 0);
    return totalClosureRate / weeklyData.length;
  };

  // Helper function to format dates
  const formatDate = (date) => {
    return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
  };

  const padZero = (num) => {
    return num < 10 ? `0${num}` : num;
  };

  return (
    <Container className="app-container">
      <Header>
        <h1 className="app-title">GitHub Issues Analyzer</h1>
      </Header>
      <Content>
        <Panel bordered className="input-panel">
          <Form fluid>
            <Form.Group>
              <Form.ControlLabel>GitHub Repository (format: owner/repo):</Form.ControlLabel>
              <Form.Control 
                name="repo" 
                value={repoPath}
                onChange={value => setRepoPath(value)}
                placeholder="e.g., facebook/react" 
              />
            </Form.Group>
            <Form.Group>
              <ButtonToolbar>
                <Button appearance="primary" onClick={handleSubmit} disabled={loading}>
                  Analyze Issues
                </Button>
              </ButtonToolbar>
            </Form.Group>
          </Form>
          {error && <div className="error-message">{error}</div>}
          {loading && <div className="loader-container"><Loader size="lg" content="Loading data..." /></div>}
        </Panel>
        
        {analysisData && (
          <Panel bordered className="results-panel">
            <h2>Repository Analysis: {analysisData.repoPath}</h2>
            
            <Divider />
            
            <h3>Issues Metrics</h3>
            
            <FlexboxGrid className="metrics-grid">
              <FlexboxGrid.Item colspan={8} className="metric-card">
                <Panel bordered>
                  <h4>Status Counts</h4>
                  <div className="status-counts">
                    <div>Open Issues: <strong>{analysisData.statusCounts.open}</strong></div>
                    <div>Closed Issues: <strong>{analysisData.statusCounts.closed}</strong></div>
                    <div>Total Issues: <strong>{analysisData.statusCounts.total}</strong></div>
                  </div>
                </Panel>
              </FlexboxGrid.Item>
              
              <FlexboxGrid.Item colspan={16} className="metric-card">
                <Panel bordered>
                  <h4>Weekly Issue Count (Last 10 Weeks)</h4>
                  <Table
                    height={280}
                    data={analysisData.weeklyData}
                    autoHeight
                  >
                    <Column width={200}>
                      <HeaderCell>Week</HeaderCell>
                      <Cell dataKey="weekLabel" />
                    </Column>
                    <Column width={150}>
                      <HeaderCell>New Issues</HeaderCell>
                      <Cell dataKey="newIssues" />
                    </Column>
                    <Column width={150}>
                      <HeaderCell>Closed Issues</HeaderCell>
                      <Cell dataKey="closedIssues" />
                    </Column>
                  </Table>
                </Panel>
              </FlexboxGrid.Item>
              
              <FlexboxGrid.Item colspan={12} className="metric-card">
                <Panel bordered>
                  <h4>New vs Closed Ratio</h4>
                  <Table
                    height={280}
                    data={analysisData.weeklyData}
                    autoHeight
                  >
                    <Column width={200}>
                      <HeaderCell>Week</HeaderCell>
                      <Cell dataKey="weekLabel" />
                    </Column>
                    <Column width={150}>
                      <HeaderCell>New Issues</HeaderCell>
                      <Cell dataKey="newIssues" />
                    </Column>
                    <Column width={150}>
                      <HeaderCell>Closed Issues</HeaderCell>
                      <Cell dataKey="closedIssues" />
                    </Column>
                    <Column width={150}>
                      <HeaderCell>Ratio (New:Closed)</HeaderCell>
                      <Cell>
                        {rowData => {
                          return typeof rowData.ratio === 'number' ? rowData.ratio.toFixed(2) : rowData.ratio;
                        }}
                      </Cell>
                    </Column>
                  </Table>
                </Panel>
              </FlexboxGrid.Item>
              
              <FlexboxGrid.Item colspan={12} className="metric-card">
                <Panel bordered>
                  <h4>Weekly Closure Rate</h4>
                  <Table
                    height={280}
                    data={analysisData.weeklyData}
                    autoHeight
                  >
                    <Column width={200}>
                      <HeaderCell>Week</HeaderCell>
                      <Cell dataKey="weekLabel" />
                    </Column>
                    <Column width={120}>
                      <HeaderCell>Open at Start</HeaderCell>
                      <Cell dataKey="openAtStart" />
                    </Column>
                    <Column width={120}>
                      <HeaderCell>New Issues</HeaderCell>
                      <Cell dataKey="newIssues" />
                    </Column>
                    <Column width={120}>
                      <HeaderCell>Closed Issues</HeaderCell>
                      <Cell dataKey="closedIssues" />
                    </Column>
                    <Column width={120}>
                      <HeaderCell>Closure Rate</HeaderCell>
                      <Cell>
                        {rowData => `${rowData.closureRate.toFixed(2)}%`}
                      </Cell>
                    </Column>
                  </Table>
                </Panel>
              </FlexboxGrid.Item>
              
              <FlexboxGrid.Item colspan={8} className="metric-card">
                <Panel bordered>
                  <h4>Average Weekly Closure Rate</h4>
                  <div className="average-rate">
                    {analysisData.averageClosureRate.toFixed(2)}%
                  </div>
                </Panel>
              </FlexboxGrid.Item>
            </FlexboxGrid>
            
            <Button 
              appearance="primary" 
              className="show-issues-btn" 
              onClick={() => setShowModal(true)}
            >
              Show All Issues
            </Button>
          </Panel>
        )}
        
        <Modal size="full" open={showModal} onClose={() => setShowModal(false)}>
          <Modal.Header>
            <Modal.Title>Issues List</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Table
              height={500}
              data={allIssues.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
              autoHeight
            >
              <Column width={100}>
                <HeaderCell>ID</HeaderCell>
                <Cell>
                  {rowData => `#${rowData.number}`}
                </Cell>
              </Column>
              <Column flexGrow={2}>
                <HeaderCell>Title</HeaderCell>
                <Cell>
                  {rowData => <a href={rowData.html_url} target="_blank" rel="noreferrer">{rowData.title}</a>}
                </Cell>
              </Column>
              <Column width={120}>
                <HeaderCell>Status</HeaderCell>
                <Cell>
                  {rowData => <span className={`status-${rowData.state}`}>{rowData.state}</span>}
                </Cell>
              </Column>
              <Column width={150}>
                <HeaderCell>Created At</HeaderCell>
                <Cell>
                  {rowData => formatDate(new Date(rowData.created_at))}
                </Cell>
              </Column>
              <Column width={150}>
                <HeaderCell>Updated At</HeaderCell>
                <Cell>
                  {rowData => formatDate(new Date(rowData.updated_at))}
                </Cell>
              </Column>
            </Table>
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={() => setShowModal(false)} appearance="subtle">
              Close
            </Button>
          </Modal.Footer>
        </Modal>
      </Content>
    </Container>
  );
}

export default GitHubIssuesAnalyzer;