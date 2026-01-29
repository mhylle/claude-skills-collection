#!/usr/bin/env python3
"""
Skill Visualizer - Generate interactive HTML visualizations.

Usage:
    python visualize.py [skills|codebase|deps] [output_path]

Example:
    python visualize.py skills docs/visualizations/skills-map.html
"""

import sys
import os
import json
import glob
import webbrowser
from datetime import datetime
from pathlib import Path


def find_skills(skills_dir: str) -> list:
    """Find all SKILL.md files and extract metadata."""
    skills = []

    for skill_file in glob.glob(f"{skills_dir}/*/SKILL.md"):
        skill_dir = os.path.dirname(skill_file)
        skill_name = os.path.basename(skill_dir)

        with open(skill_file, 'r') as f:
            content = f.read()

        # Extract frontmatter
        metadata = extract_frontmatter(content)
        metadata['path'] = skill_file
        metadata['name'] = metadata.get('name', skill_name)

        # Detect skill type based on frontmatter
        if 'context: fork' in content or 'context:fork' in content:
            metadata['type'] = 'orchestrator'
        elif 'allowed-tools:' in content:
            metadata['type'] = 'read-only'
        else:
            metadata['type'] = 'hybrid'

        # Extract description (first line after description:)
        desc = metadata.get('description', '')
        if isinstance(desc, str):
            # Truncate long descriptions
            metadata['short_desc'] = desc[:150] + '...' if len(desc) > 150 else desc
        else:
            metadata['short_desc'] = str(desc)[:150]

        skills.append(metadata)

    return skills


def extract_frontmatter(content: str) -> dict:
    """Extract YAML frontmatter from markdown."""
    if not content.startswith('---'):
        return {}

    parts = content.split('---', 2)
    if len(parts) < 3:
        return {}

    # Simple YAML parsing (no external dependencies)
    frontmatter = {}
    current_key = None
    current_value = []

    for line in parts[1].strip().split('\n'):
        if ':' in line and not line.startswith(' ') and not line.startswith('\t'):
            # Save previous key-value pair
            if current_key:
                frontmatter[current_key] = '\n'.join(current_value).strip() if current_value else ''

            key, value = line.split(':', 1)
            current_key = key.strip()
            value = value.strip()

            if value:
                current_value = [value]
            else:
                current_value = []
        elif current_key and (line.startswith(' ') or line.startswith('\t')):
            current_value.append(line.strip())

    # Save last key-value pair
    if current_key:
        frontmatter[current_key] = '\n'.join(current_value).strip() if current_value else ''

    return frontmatter


def detect_dependencies(skills: list) -> list:
    """Detect which skills reference other skills."""
    links = []
    skill_names = {s['name'] for s in skills}

    for skill in skills:
        skill_file = skill['path']
        with open(skill_file, 'r') as f:
            content = f.read().lower()

        for other_name in skill_names:
            if other_name == skill['name']:
                continue

            # Check for references to other skills
            patterns = [
                f'skill="{other_name}"',
                f"skill='{other_name}'",
                f'/{other_name}',
                f'`{other_name}`',
            ]

            for pattern in patterns:
                if pattern in content:
                    links.append({
                        'source': skill['name'],
                        'target': other_name
                    })
                    break

    return links


def generate_skills_html(skills: list, links: list, output_path: str) -> None:
    """Generate interactive HTML visualization of skills."""
    nodes = []

    for skill in skills:
        nodes.append({
            'id': skill['name'],
            'type': skill.get('type', 'hybrid'),
            'description': skill.get('short_desc', ''),
            'hasArgs': 'argument-hint' in str(skill),
            'hasFork': skill.get('type') == 'orchestrator',
        })

    # Ensure output directory exists
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Claude Skills Collection</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        * {{ box-sizing: border-box; }}
        body {{
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 0;
            background: #1a1a2e;
            color: #eee;
            overflow: hidden;
        }}
        .container {{
            display: flex;
            height: 100vh;
        }}
        .sidebar {{
            width: 300px;
            background: #252542;
            padding: 20px;
            border-right: 1px solid #3d3d5c;
            overflow-y: auto;
            flex-shrink: 0;
        }}
        .main {{
            flex: 1;
            position: relative;
        }}
        h1 {{
            margin: 0 0 20px 0;
            font-size: 20px;
            color: #fff;
        }}
        h2 {{
            margin: 20px 0 10px 0;
            font-size: 14px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}
        .legend {{
            margin-bottom: 20px;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            margin: 8px 0;
            font-size: 13px;
        }}
        .legend-dot {{
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 10px;
        }}
        .stat {{
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #3d3d5c;
            font-size: 14px;
        }}
        .stat-value {{
            font-weight: bold;
            color: #fff;
        }}
        svg {{
            width: 100%;
            height: 100%;
        }}
        .node {{ cursor: pointer; }}
        .node circle {{
            stroke: #fff;
            stroke-width: 2px;
            transition: r 0.2s;
        }}
        .node:hover circle {{
            r: 25;
        }}
        .node text {{
            font-size: 11px;
            fill: #fff;
            pointer-events: none;
        }}
        .orchestrator circle {{ fill: #4CAF50; }}
        .read-only circle {{ fill: #2196F3; }}
        .hybrid circle {{ fill: #FF9800; }}
        .link {{
            stroke: #666;
            stroke-opacity: 0.6;
            fill: none;
            marker-end: url(#arrowhead);
        }}
        .tooltip {{
            position: absolute;
            background: #333;
            border: 1px solid #555;
            padding: 12px;
            border-radius: 6px;
            font-size: 13px;
            max-width: 300px;
            pointer-events: none;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }}
        .tooltip-title {{
            font-weight: bold;
            margin-bottom: 6px;
            color: #fff;
        }}
        .tooltip-type {{
            font-size: 11px;
            color: #888;
            margin-bottom: 8px;
        }}
        .tooltip-desc {{
            color: #ccc;
            line-height: 1.4;
        }}
        .skill-list {{
            margin-top: 10px;
        }}
        .skill-item {{
            padding: 8px;
            margin: 4px 0;
            background: #1a1a2e;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
        }}
        .skill-item:hover {{
            background: #2d2d44;
        }}
        .skill-item .dot {{
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <h1>Skills Collection</h1>

            <h2>Legend</h2>
            <div class="legend">
                <div class="legend-item">
                    <div class="legend-dot" style="background: #4CAF50"></div>
                    <span>Orchestrator (context: fork)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-dot" style="background: #2196F3"></div>
                    <span>Read-only (tool restrictions)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-dot" style="background: #FF9800"></div>
                    <span>Hybrid (standard)</span>
                </div>
            </div>

            <h2>Statistics</h2>
            <div class="stat">
                <span>Total Skills</span>
                <span class="stat-value">{len(nodes)}</span>
            </div>
            <div class="stat">
                <span>Orchestrators</span>
                <span class="stat-value">{sum(1 for n in nodes if n['type'] == 'orchestrator')}</span>
            </div>
            <div class="stat">
                <span>Read-only</span>
                <span class="stat-value">{sum(1 for n in nodes if n['type'] == 'read-only')}</span>
            </div>
            <div class="stat">
                <span>Dependencies</span>
                <span class="stat-value">{len(links)}</span>
            </div>

            <h2>Skills</h2>
            <div class="skill-list" id="skill-list"></div>
        </div>
        <div class="main">
            <svg id="graph"></svg>
        </div>
    </div>
    <div class="tooltip" id="tooltip" style="display: none;"></div>

    <script>
        const nodes = {json.dumps(nodes)};
        const links = {json.dumps(links)};

        const colors = {{
            'orchestrator': '#4CAF50',
            'read-only': '#2196F3',
            'hybrid': '#FF9800'
        }};

        // Populate skill list
        const skillList = document.getElementById('skill-list');
        nodes.sort((a, b) => a.id.localeCompare(b.id)).forEach(node => {{
            const item = document.createElement('div');
            item.className = 'skill-item';
            item.innerHTML = `<div class="dot" style="background: ${{colors[node.type]}}"></div>${{node.id}}`;
            item.onclick = () => highlightNode(node.id);
            skillList.appendChild(item);
        }});

        // Setup SVG
        const svg = d3.select("#graph");
        const container = svg.append("g");

        // Add zoom
        const zoom = d3.zoom()
            .scaleExtent([0.3, 3])
            .on("zoom", (event) => container.attr("transform", event.transform));
        svg.call(zoom);

        // Add arrow marker
        svg.append("defs").append("marker")
            .attr("id", "arrowhead")
            .attr("viewBox", "-0 -5 10 10")
            .attr("refX", 25)
            .attr("refY", 0)
            .attr("orient", "auto")
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .append("path")
            .attr("d", "M 0,-5 L 10,0 L 0,5")
            .attr("fill", "#666");

        // Create simulation
        const width = document.querySelector('.main').clientWidth;
        const height = document.querySelector('.main').clientHeight;

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(120))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(40));

        // Draw links
        const link = container.append("g")
            .selectAll("path")
            .data(links)
            .join("path")
            .attr("class", "link");

        // Draw nodes
        const node = container.append("g")
            .selectAll("g")
            .data(nodes)
            .join("g")
            .attr("class", d => "node " + d.type)
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        node.append("circle")
            .attr("r", 18);

        node.append("text")
            .attr("dy", 35)
            .attr("text-anchor", "middle")
            .text(d => d.id);

        // Tooltip
        const tooltip = document.getElementById('tooltip');

        node.on("mouseover", (event, d) => {{
            tooltip.innerHTML = `
                <div class="tooltip-title">${{d.id}}</div>
                <div class="tooltip-type">${{d.type.toUpperCase()}}</div>
                <div class="tooltip-desc">${{d.description}}</div>
            `;
            tooltip.style.display = 'block';
            tooltip.style.left = (event.pageX + 15) + 'px';
            tooltip.style.top = (event.pageY - 10) + 'px';
        }})
        .on("mousemove", (event) => {{
            tooltip.style.left = (event.pageX + 15) + 'px';
            tooltip.style.top = (event.pageY - 10) + 'px';
        }})
        .on("mouseout", () => {{
            tooltip.style.display = 'none';
        }});

        // Tick function
        simulation.on("tick", () => {{
            link.attr("d", d => {{
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                return `M${{d.source.x}},${{d.source.y}}L${{d.target.x}},${{d.target.y}}`;
            }});

            node.attr("transform", d => `translate(${{d.x}},${{d.y}})`);
        }});

        // Drag functions
        function dragstarted(event) {{
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }}

        function dragged(event) {{
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }}

        function dragended(event) {{
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }}

        // Highlight function
        function highlightNode(nodeId) {{
            const nodeData = nodes.find(n => n.id === nodeId);
            if (nodeData) {{
                svg.transition().duration(750).call(
                    zoom.transform,
                    d3.zoomIdentity.translate(width/2 - nodeData.x, height/2 - nodeData.y)
                );
            }}
        }}
    </script>
</body>
</html>'''

    with open(output_path, 'w') as f:
        f.write(html)

    print(f"Generated: {output_path}")


def generate_codebase_html(root_dir: str, output_path: str) -> None:
    """Generate codebase structure visualization."""
    # Simplified implementation - structure scanner
    structure = scan_directory(root_dir)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Codebase Structure</title>
    <style>
        body {{
            font-family: system-ui, sans-serif;
            margin: 0;
            padding: 20px;
            background: #1a1a2e;
            color: #eee;
        }}
        h1 {{ color: #fff; }}
        .tree {{ list-style: none; padding-left: 20px; }}
        details {{ cursor: pointer; }}
        summary {{ padding: 4px 8px; border-radius: 4px; }}
        summary:hover {{ background: #2d2d44; }}
        .folder {{ color: #ffd700; }}
        .file {{ padding: 4px 8px; display: flex; align-items: center; }}
        .file:hover {{ background: #2d2d44; }}
        .size {{ color: #888; margin-left: auto; font-size: 12px; }}
    </style>
</head>
<body>
    <h1>Codebase Structure</h1>
    <ul class="tree" id="root"></ul>
    <script>
        const data = {json.dumps(structure)};

        function fmt(b) {{
            if (b < 1024) return b + ' B';
            if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
            return (b/1048576).toFixed(1) + ' MB';
        }}

        function render(node, parent) {{
            if (node.children) {{
                const det = document.createElement('details');
                det.open = parent === document.getElementById('root');
                det.innerHTML = `<summary><span class="folder">${{node.name}}</span><span class="size">${{fmt(node.size)}}</span></summary>`;
                const ul = document.createElement('ul');
                ul.className = 'tree';
                node.children.sort((a,b) => (b.children?1:0)-(a.children?1:0) || a.name.localeCompare(b.name));
                node.children.forEach(c => render(c, ul));
                det.appendChild(ul);
                const li = document.createElement('li');
                li.appendChild(det);
                parent.appendChild(li);
            }} else {{
                const li = document.createElement('li');
                li.className = 'file';
                li.innerHTML = `${{node.name}}<span class="size">${{fmt(node.size)}}</span>`;
                parent.appendChild(li);
            }}
        }}

        data.children.forEach(c => render(c, document.getElementById('root')));
    </script>
</body>
</html>'''

    with open(output_path, 'w') as f:
        f.write(html)

    print(f"Generated: {output_path}")


def scan_directory(path: str, ignore: set = None) -> dict:
    """Recursively scan directory structure."""
    if ignore is None:
        ignore = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.cache'}

    path = Path(path)
    result = {"name": path.name, "children": [], "size": 0}

    try:
        for item in sorted(path.iterdir()):
            if item.name in ignore or item.name.startswith('.'):
                continue

            if item.is_file():
                size = item.stat().st_size
                result["children"].append({"name": item.name, "size": size})
                result["size"] += size
            elif item.is_dir():
                child = scan_directory(item, ignore)
                if child["children"]:
                    result["children"].append(child)
                    result["size"] += child["size"]
    except PermissionError:
        pass

    return result


def main():
    viz_type = sys.argv[1] if len(sys.argv) > 1 else 'skills'

    # Determine paths
    script_dir = Path(__file__).parent.parent.parent.parent  # Go up to project root
    skills_dir = script_dir / 'skills'

    date_str = datetime.now().strftime("%Y-%m-%d")
    default_output = script_dir / 'docs' / 'visualizations' / f'{viz_type}-map-{date_str}.html'
    output = sys.argv[2] if len(sys.argv) > 2 else str(default_output)

    if viz_type == 'skills':
        skills = find_skills(str(skills_dir))
        links = detect_dependencies(skills)
        generate_skills_html(skills, links, output)
        print(f"Found {len(skills)} skills with {len(links)} dependencies")
    elif viz_type == 'codebase':
        generate_codebase_html(str(script_dir), output)
    elif viz_type == 'deps':
        skills = find_skills(str(skills_dir))
        links = detect_dependencies(skills)
        generate_skills_html(skills, links, output)  # Same as skills but focused on deps
    else:
        print(f"Unknown visualization type: {viz_type}")
        print("Usage: python visualize.py [skills|codebase|deps] [output_path]")
        sys.exit(1)

    # Open in browser
    try:
        webbrowser.open(f'file://{Path(output).absolute()}')
    except Exception as e:
        print(f"Could not open browser: {e}")
        print(f"Open manually: {output}")


if __name__ == '__main__':
    main()
