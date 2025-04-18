let data = [];
let realData = [];
let currentCategory = '';
let numericalColumnName = '';
let columnSequence = [];
let hierarchytxt = '';
let root;
let count = 0;
let totalLevels = 0;
let globalCsvData = null;

// The dimensions and margins of the entire diagram
const margin = { top: 20, right: 50, bottom: 20, left: 50 };

const customColors = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    "#aec7e8", "#ffbb78", "#98df8a", "#ff9896", "#c5b0d5",
    "#c49c94", "#f7b6d2", "#c7c7c7", "#dbdb8d", "#9edae5",
    "#f5b7a7", "#d5a6bd" 
];

function parseToTree(input) {
    const lines = input.trim().split('\n');
    const root = {};
    const stack = [{ node: root, indent: -1 }];

    lines.forEach(line => {
        const indent = line.search(/\S/); 
        const nodeName = line.trim();
        const newNode = {};
        while (stack.length && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }
        const parent = stack[stack.length - 1].node;
        parent[nodeName] = newNode;
        stack.push({ node: newNode, indent: indent });
    });

    return root;
}

function transformData(data, depth, highlightDepth = -1) {
    const transform = (obj, currentDepth) => {
        if (currentDepth > depth) return [];
        return Object.keys(obj).map(key => {
            const children = transform(obj[key], currentDepth + 1);
            return { 
                name: key, 
                children: children.length ? children : null,
                highlight: currentDepth === highlightDepth - 1 // Highlight the children of the specified depth
            };
        });
    };
    
    return Object.keys(data).map(key => ({ 
        name: key, 
        children: transform(data[key], 0),
        highlight: highlightDepth === 0 
    }));
}

// Function to determine indented hierarchy based on CSV data and selected Hierarchy sequence 
async function determineColumnSequence(csvData,sortedColumns) {
    const data = d3.csvParse(csvData);
    const hierarchy = buildHierarchy1(data, sortedColumns);
    const indentedHierarchy = storeIndentedHierarchy(hierarchy);

    hierarchytxt = indentedHierarchy;

    return {
        columnSequence: sortedColumns,
        indentedHierarchy: indentedHierarchy
    };
}

//Formatting the data on the current hierarchy categorical column
function buildHierarchy1(data, columns) {
    const root = {};
    data.forEach(row => {
        let currentNode = root;
        columns.forEach((col, index) => {
            const value = row[col];
            if (!currentNode[value]) {
                currentNode[value] = {};
            }
            currentNode = currentNode[value];
        });
    });
    return root;
}

//Function to build the level information pyramid
function createLevelPyramid(totalLevels, currentLevel) {
    const pyramidSvg = d3.select("#pyramidSvg");
    const width = 200; 
    const height = 150; 
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    
    pyramidSvg.attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);

    pyramidSvg.selectAll("*").remove();

    const segmentHeight = height / totalLevels;

    for (let i = 0; i < totalLevels; i++) {
        const yOffset = (totalLevels - i - 1) * segmentHeight;
        const levelWidth = width * ((totalLevels - i) / totalLevels);

        pyramidSvg.append("rect")
            .attr("x", (width - levelWidth) / 2 + margin.left)
            .attr("y", yOffset + margin.top)
            .attr("width", levelWidth)
            .attr("height", segmentHeight)
            .attr("fill", currentLevel === totalLevels - i ? "black" : "white") // Highlight current level
            .attr("stroke", "black");

        // Adding level text
        pyramidSvg.append("text")
            .attr("x", width / 2 + margin.left)
            .attr("y", yOffset + margin.top + segmentHeight / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .style("fill", "green")
            .style("font-weight", currentLevel === totalLevels - i ? "bold" : "normal")
            .text(` ${totalLevels - i}`);
    }
}

//Function to store the hierarchy data in indented format
function storeIndentedHierarchy(node, level = 0) {
    let result = '';
    Object.keys(node).forEach(key => {
        result += ' '.repeat(level * 4) + key + '\n';
        result += storeIndentedHierarchy(node[key], level + 1);
    });
    return result;
}

//Populating the dropdown with the hierarchy clusters determined by the system
function populateClustersDropdown(values) {
    const dropdown = document.getElementById("drillDownDropdown");
    const inputField = document.getElementById("sequenceInput");

    dropdown.innerHTML = ""; 

    values.forEach(value => {
        const option = document.createElement("option");
        option.textContent = value;  
        option.value = value;        
        dropdown.appendChild(option);
    });

    // Sets the first dropdown option as the default in the input field
    if (values.length > 0) {
        dropdown.value = values[0];  
        inputField.value = values[0]; 
    }

    //event listener to update input field when dropdown selection changes
    dropdown.addEventListener("change", function() {
        inputField.value = dropdown.value; 
    });
}

// Function to handle the imported csv data and call the server to determine the multiple hierarchies and also predict the proper seqeunce for 
// each of them using the ML model. Get the predicted clusters from the server and calls the function to populate the sorted clusters in dropdown.
async function handleImport() {
    const input = document.getElementById('csvFileInput');
    if (!input.files || input.files.length === 0) {
        alert('Please select a CSV file to import.');
        return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async function(event) {
        const csvData = event.target.result;
        // Send CSV data to Python Flask API
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('https://hierarchyviz.onrender.com/process_csv', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.error) {
                console.error("Error from server:", data.error);
                alert("Server error: " + data.error);
                return;
            }

            const sortedClusters = data.clusters; 
            populateClustersDropdown(Object.values(sortedClusters).map(arr => arr.join(', ')));

        } catch (error) {
            console.error("Error fetching from Flask API:", error);
            alert("Something went wrong while processing the file.");
        }

        globalCsvData = csvData;
    };

    reader.readAsText(file);
}

//Function to set the choosen cluster hierarchy and filter the dataset accordingly
async function setHierarchy() {

    const inputValue = document.getElementById('sequenceInput').value;
    const sortedColumns = inputValue.split(',').map(item => item.trim());
    const result = await determineColumnSequence(globalCsvData,sortedColumns);
    columnSequence = result.columnSequence;
    totalLevels = columnSequence.length;

    const indentedHierarchy = result.indentedHierarchy;

    numericalColumnName = document.getElementById('numericalColumnInput').value.trim();
    if (numericalColumnName && !columnSequence.includes(numericalColumnName)) {
        columnSequence.push(numericalColumnName);
    }
    
    processData(globalCsvData);
}


//function to process the initial csv data into objects and calls all the functions to generate the visualizations
function processData(csvData) {
    try {
        data = d3.csvParse(csvData, function(d) {
            const reorderedRow = {};
            columnSequence.forEach(column => {
                reorderedRow[column] = d[column];
            });
            return reorderedRow;
        });

        if (!data || data.length === 0) {
            throw new Error("CSV data is empty or invalid.");
        }
        
        realData = [...data];
        populateDropdown();

        d3.select("#my_dataviz svg").remove();
        currentCategory = document.getElementById('categorySelect').value;
        renderTreemap();
        const dropdown = document.getElementById('categorySelect');
        const count = dropdown.selectedIndex;
        createLevelPyramid(totalLevels,count+1);
        const treeData = parseToTree(hierarchytxt);
        root = { name: "Root", children: transformData(treeData, Infinity,count) };
        createTreeDiagram(root); 

    } catch (error) {
        console.error("Error processing CSV data:", error);
        alert("Error processing CSV data: " + error.message);
    }
}

//Function to generate the dropdown list based on the selected hierarchy and also to update visualizations based on the select dropdown value
function populateDropdown() {
    const dropdown = document.getElementById('categorySelect');
    dropdown.innerHTML = ''; 
    const numericalColumns = [];
    data.columns.forEach(column => {
        if (!isNaN(data[0][column]) && column.toLowerCase() !== 'value') {
            numericalColumns.push(column);
        }
    });

    columnSequence.forEach(column => {
        if (!numericalColumns.includes(column)) {
            const option = document.createElement('option');
            option.value = column;
            option.text = column;
            dropdown.appendChild(option);
        }
    });

    document.querySelector('.dropdown-container').style.display = 'block';
}

//Function to create the tree structure
function createTreeDiagram(root) {
    d3.select("#my_treeStructure svg").selectAll("*").remove();
    const hierarchy = d3.hierarchy(root, d => d.children);
    const treeLayout = d3.tree()
        .nodeSize([15, 45])
        .separation((a, b) => a.parent == b.parent ? 1 : 1.2);

    treeLayout(hierarchy);

    const nodes = hierarchy.descendants();
    const xExtent = d3.extent(nodes, d => d.x);
    const yExtent = d3.extent(nodes, d => d.y);

    const svgWidth = xExtent[1] - xExtent[0] + 200; 
    const svgHeight = yExtent[1] - yExtent[0] + 100;

    const treesvg = d3.select("#treeSvg")
        .attr("width", svgWidth)
        .attr("height", svgHeight)
        .append("g")
        .attr("transform", `translate(${margin.left - xExtent[0]}, ${margin.top})`);

    const colorScale = d3.scaleOrdinal(customColors);
    hierarchy.children.forEach((child, i) => {
        const color = colorScale(i);
        colorNodes(child, color);
    });

    // Function to assign colors recursively
    function colorNodes(node, color) {
        node.data.color = color;
        if (node.children) {
            node.children.forEach(child => colorNodes(child, color));
        }
    }

    // Drawing edges between nodes
    treesvg.selectAll(".link")
        .data(hierarchy.links())
        .enter().append("line")
        .attr("class", "link")
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)
        .style("stroke", "#ccc")
        .style("stroke-width", "2px");

    // Drawing nodes
    const node = treesvg.selectAll(".node")
        .data(nodes)
        .enter().append("g")
        .attr("class", d => "node" + (d.children ? " node--internal" : " node--leaf"))
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
        .on("mouseover", function(event, d) {
            d3.select("#tooltip").transition()
                .duration(200)
                .style("opacity", .9);
            d3.select("#tooltip").html(d.data.name)
                .style("left", (event.pageX + 5) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(d) {
            d3.select("#tooltip").transition()
                .duration(500)
                .style("opacity", 0);
        });

       // Append circles for all nodes at the current level as highlighting effect
       node.append("circle")
       .attr("r", d => d.data.highlight ? 8 : 7)
       .style("fill", d => d.data.color)
       .style("stroke", d => d.data.highlight ? "black" : "none") 
        .style("stroke-width", d => d.data.highlight ? 2 : 0);

}

// Event listener to the dropdown for category selection and updating visualizations based on the selected value
document.getElementById('categorySelect').addEventListener('change', function() {
    currentCategory = this.value;
    d3.select("#my_dataviz svg").remove(); 
    renderTreemap();
    const dropdown = document.getElementById('categorySelect');
    count = dropdown.selectedIndex;
    createLevelPyramid(totalLevels,count+1);

    const treeData = parseToTree(hierarchytxt);
    root = { name: "Root", children: transformData(treeData,Infinity,count) };

    createTreeDiagram(root);
});

// To ensure that handleImport is called when the CSV is imported
document.getElementById('importButton').addEventListener('click', handleImport);


//Function to generate the treemap using the csvdata and the current level in hierarchy
function renderTreemap() {
    const margin = { top: 10, right: 10, bottom: 10, left: 150 };
    const treemapWidth = 800;
    const treemapHeight = 600;
    const legendWidth = 200; 
    const legendHeight = 600;

    const svg = d3.select("#my_dataviz")
        .append("svg")
        .attr("width", treemapWidth + legendWidth + margin.left + margin.right)
        .attr("height", Math.max(treemapHeight, legendHeight) + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const hierarchyData = buildHierarchy(data, currentCategory, numericalColumnName);
    const root = d3.hierarchy(hierarchyData)
        .sum(d => d.value); 
    const colorScale = d3.scaleOrdinal(customColors);

    // Creating the treemap layout
    d3.treemap()
        .size([treemapWidth, treemapHeight])
        .padding(4)
        .round(true)
        (root);
    const leavesWithValues = root.leaves().filter(node => node.value > 0);

    // Adding rectangles for the treemap
    svg.selectAll("rect")
        .data(leavesWithValues)
        .join("rect")
        .attr('x', d => d.x0)
        .attr('y', d => d.y0)
        .attr('width', d => Math.max(0, d.x1 - d.x0))
        .attr('height', d => Math.max(0, d.y1 - d.y0))
        .style("stroke", "black")
        .style("fill", d => {
            while (d.depth > 1) d = d.parent; 
            return colorScale(d.data.name);
        })
        .on("mouseover", function(event, d) {
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            tooltip.html(`<strong>Name:</strong> ${d.data.name}<br><strong>Value:</strong> ${d.value.toFixed(2)}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

    // Tooltip element
    const tooltip = d3.select("#my_dataviz")
        .append("div")
        .style("opacity", 0)
        .attr("class", "tooltip");

    // Adding text labels for node names
    svg.selectAll("text")
        .data(leavesWithValues)
        .join("text")
        .attr("x", d => d.x0 + 5)
        .attr("y", d => d.y0 + 15)
        .text(d => d.data.name)
        .attr("font-size", "12px")
        .attr("fill", "white");

    // Legend
    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${treemapWidth}, 0)`);

    const legendItems = colorScale.domain();

    const legendRectSize = 18; 
    const legendSpacing = 4; 

    legend.selectAll(".legend-item")
        .data(legendItems)
        .enter().append("g")
        .attr("class", "legend-item")
        .attr("transform", (d, i) => `translate(0, ${i * (legendRectSize + legendSpacing)})`);

    legend.selectAll(".legend-item")
        .append("rect")
        .attr("x", 0)
        .attr("width", legendRectSize)
        .attr("height", legendRectSize)
        .style("fill", colorScale);

    legend.selectAll(".legend-item")
        .append("text")
        .attr("x", legendRectSize + legendSpacing)
        .attr("y", legendRectSize / 2)
        .attr("dy", "0.35em")
        .text(d => d);

    const svgHeight = Math.max(treemapHeight, legendHeight) + margin.top + margin.bottom;
    svg.attr("height", svgHeight);
}

//Formatting the data based on the Hierarchy sequence
function buildHierarchy(csv, category, numericalColumn) {
    const root = { name: "root", children: [] };

    csv.forEach(row => {
        const value = +row[numericalColumn];
        let currentNode = root;
        columnSequence.forEach(col => {
            if (col === category) {
                const nodeName = row[col];
                let childNode = currentNode.children.find(child => child.name === nodeName);
                if (!childNode) {
                    childNode = { name: nodeName, value: 0 };
                    currentNode.children.push(childNode);
                }
                childNode.value += value;
            } else {
                const nodeName = row[col];
                let childNode = currentNode.children.find(child => child.name === nodeName);
                if (!childNode) {
                    childNode = { name: nodeName, children: [] };
                    currentNode.children.push(childNode);
                }
                currentNode = childNode;
            }
        });
    });

    return root;
}

//Function to update the treemap based on the current category and the numerical column updates
function updateTreemap() {
    currentCategory = document.getElementById('categorySelect').value;
    numericalColumnName = document.getElementById('numericalColumnInput').value.trim();
    const sequenceInput = document.getElementById('sequenceInput').value.trim();
    columnSequence = sequenceInput.split(',').map(col => col.trim());
    populateDropdown();

    d3.select("#my_dataviz svg").remove();
    renderTreemap();
}

function applyNewSequence() {
    updateTreemap();
}
