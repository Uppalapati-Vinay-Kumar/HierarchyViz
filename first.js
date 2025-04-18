let data = [];
let realData = [];
let drillDownPath = [];
let colorMapping = new Map();
let count = 0;
let totalLevels = 0;
let columnSequence = [];
let root;
let globalCsvData = null;
const customColors = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    "#aec7e8", "#ffbb78", "#98df8a", "#ff9896", "#c5b0d5",
    "#c49c94", "#f7b6d2", "#c7c7c7", "#dbdb8d", "#9edae5",
    "#f5b7a7", "#d5a6bd" 
];

let hierarchytxt = '';

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
                highlight: currentDepth === highlightDepth - 1 // Highlight the children nodes of the specified depth
            };
        });
    };
    
    return Object.keys(data).map(key => ({ 
        name: key, 
        children: transform(data[key], 0),
        highlight: highlightDepth === 0
    }));
}


// Dimensions and margins of the entire diagram 
const margin = { top: 20, right: 50, bottom: 20, left: 50 };


//Color scale for branches
const colorScale = d3.scaleOrdinal(customColors);


async function determineColumnSequence(csvData,sortedColumns) {
    const data = d3.csvParse(csvData);
    const hierarchy = buildHierarchy(data, sortedColumns);
    const indentedHierarchy = storeIndentedHierarchy(hierarchy);
    hierarchytxt = indentedHierarchy;

    return {
        columnSequence: sortedColumns,
        indentedHierarchy: indentedHierarchy
    };
}

//Formatting the data based on the Hierarchy sequence
function buildHierarchy(data, columns) {
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

//Formatting the data based on the current hierarchy categorical column
function buildHierarchy1(csv, category, numericalColumn) {
    const root = { name: "root", children: [] };

    csv.forEach(row => {
        const value = +row[numericalColumn];
        let currentNode = root;

        //console.log("bar col sequence",columnSequence);

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
function populateDropdown(values) {
    const dropdown = document.getElementById("drillDownDropdown");
    const inputField = document.getElementById("drillDownSequenceInput");

    dropdown.innerHTML = ""; 

    values.forEach(value => {
        const option = document.createElement("option");
        option.textContent = value;  
        option.value = value;        
        dropdown.appendChild(option);
    });

    // Setting the first dropdown option as the default in the drillDownSequence field
    if (values.length > 0) {
        dropdown.value = values[0];  // Select first item
        inputField.value = values[0]; // Update input field
    }

    //Event listener to update input field when dropdown selection changes
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
            populateDropdown(Object.values(sortedClusters).map(arr => arr.join(', ')));
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

    const inputValue = document.getElementById('drillDownSequenceInput').value;
    const sortedColumns = inputValue.split(',').map(item => item.trim());
    const result = await determineColumnSequence(globalCsvData,sortedColumns);
    columnSequence = result.columnSequence;
    const indentedHierarchy = result.indentedHierarchy;

    processData(globalCsvData);
}

//function to process the initial csv data into objects and store for usage in visualizations
function processData(csvData) {
    data = d3.csvParse(csvData);
    realData = [...data];
    //console.log("Script data", data);
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
            .attr("fill", currentLevel === totalLevels - i ? "black" : "white") // Highlights the current level in the pyramid
            .attr("stroke", "black");

        pyramidSvg.append("text")
            .attr("x", width / 2 + margin.left)
            .attr("y", yOffset + margin.top + segmentHeight / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .style("fill", "green")
            .style("font-weight", currentLevel === totalLevels - i ? "bold" : "normal")
            .text(`${totalLevels - i}`); 
    }
}

// Action listener for the update button
document.addEventListener("DOMContentLoaded", () => {
    d3.select("#updateChartButton").on("click", () => {
        const drillDownSequenceInput = d3.select("#drillDownSequenceInput").property("value");
        const numericalColumnInput = d3.select("#numericalColumnInput").property("value");

        if (!drillDownSequenceInput || !numericalColumnInput) {
            alert("Please enter Numerical Column.");
            return;
        }

        const drillDownSequence = drillDownSequenceInput.split(',').map(d => d.trim());
        const numericalColumn = numericalColumnInput.trim();
        totalLevels = drillDownSequence.length;
        
        const topLevel = drillDownSequence[0];
        const topCategories = Array.from(new Set(data.map(d => d[topLevel])));
        const colorScale = d3.scaleOrdinal(customColors)
            .domain(topCategories);
        topCategories.forEach(category => {
            colorMapping.set(category, colorScale(category));
        });
        

        // Populate dropdown menu
        const dropdown = d3.select("#levelDropdown");
        dropdown.selectAll("option").remove();
        drillDownSequence.forEach((level, index) => {
            dropdown.append("option")
                .attr("value", index)
                .text(level);
        });

        // Add event listener to the dropdown menu
        dropdown.on("change", function() {
            const selectedLevelIndex = +this.value;
            count = selectedLevelIndex;
            drillDownPath.length = 0;
            for (let i = 0; i < selectedLevelIndex; i++) {
                drillDownPath.push({ column: drillDownSequence[i] });
            }
            createBarChart(realData, drillDownSequence, numericalColumn, drillDownPath);
            createLevelPyramid(totalLevels,count+1);
            d3.select("#updateChartButton").dispatch("click");
        });


        const treeData = parseToTree(hierarchytxt);
        root = { name: "Root", children: transformData(treeData, Infinity, count) };
        createTreeDiagram(root);
        createLevelPyramid(totalLevels,count+1);

        createBarChart(data, drillDownSequence, numericalColumn, drillDownPath);
        createLevelPyramid(totalLevels,count+1);

        // Add event listener to the drill down button
        d3.select("#drillDownButton").on("click", () => {
            let currentLevelIndex = drillDownPath.length;
            if (currentLevelIndex < drillDownSequence.length - 1) {
                count += 1;
                const currentCategoricalColumn = drillDownSequence[currentLevelIndex];
                drillDownPath.push({ column: currentCategoricalColumn });
                createBarChart(realData, drillDownSequence, numericalColumn, drillDownPath);
                root = { name: "Root", children: transformData(treeData,Infinity,count) };
                createTreeDiagram(root);
                createLevelPyramid(totalLevels,count+1);
            }
        }).style("display", "block");

        // Add event listener to the drill up button
        d3.select("#drillUpButton").on("click", () => {
            if (count > 0) {
                count -= 1;
                drillDownPath.pop();
                createBarChart(realData, drillDownSequence, numericalColumn, drillDownPath);
                root = { name: "Root", children: transformData(treeData,Infinity,count) };
                createTreeDiagram(root);
                createLevelPyramid(totalLevels,count+1);
            }
        }).style("display", "block");
    });

    d3.select("#updateChartButton").dispatch("click");

});

//Function to create the tree structure
function createTreeDiagram(root) {
    d3.select("#treeSvg").selectAll("*").remove();

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

    // Assign colors to nodes
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

    // Draw edges connecting the nodes
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

    // Append circles for all nodes based on the hierarchy level
    node.append("circle")
        .attr("r", d => d.data.highlight ? 8 : 7)
        .style("fill", d => d.data.color)
        .style("stroke", d => d.data.highlight ? "black" : "none") // Black border for highlighted nodes
    .style("stroke-width", d => d.data.highlight ? 2 : 0); // Set stroke width for highlighted nodes

}

//Function to assign colors to the parents and childs
function flattenHierarchy(data, parentColor = null) {
    const flattenedData = [];
    
    function recurse(node, parentName = '', parentColor = null) {
        if (node.value !== undefined) {
            flattenedData.push({ 
                name: parentName ? `${parentName} -> ${node.name}` : node.name, 
                value: node.value,
                color: parentColor
            });
        }
        
        if (node.children) {
            node.children.forEach(child => {
                const childColor = parentColor || colorMapping.get(child.name.split(' > ')[0]); // Get the parent's color
                recurse(child, node.name, childColor);
            });
        }
    }

    recurse(data); 
    return flattenedData;
}

// Function to create color mapping for the top level
function createColorMapping(data, topLevelCategory) {
    const topLevelCategories = Array.from(new Set(data.map(d => d[topLevelCategory])));
    const colorScale = d3.scaleOrdinal(customColors).domain(topLevelCategories);
    const topLevelColorMap = new Map();
    topLevelCategories.forEach(category => {
        topLevelColorMap.set(category, colorScale(category));
    });

    return topLevelColorMap;
}



// Function to create the bar chart
function createBarChart(data, drillDownSequence, numericalColumn, drillDownPath) {
    const barsvg = d3.select("#newBarGraph");
    const width = 1250; 
    const height = 500; 
    const margin = { top: 50, right: 150, bottom: 150, left: 150 };  

    barsvg.attr("width", width).attr("height", height);

    barsvg.selectAll("*").remove();

    let currentLevelIndex = drillDownPath.length;
    const currentCategoricalColumn = drillDownSequence[currentLevelIndex];

    const hierarchyData = buildHierarchy1(data, currentCategoricalColumn, numericalColumn);

    const topLevelCategory = drillDownSequence[0]; 
    const colorMapping = createColorMapping(data, topLevelCategory); 

    const flattenedData = flattenHierarchy(hierarchyData, colorMapping);

    const x = d3.scaleBand()
    .domain(flattenedData.map((d, index) => `${d.name}-${index}`)) 
    .range([margin.left, width - margin.right])
    .padding(0.05);

    const y = d3.scaleLinear()
    .domain([0, d3.max(flattenedData, d => d.value)])
    .nice()
    .range([height - margin.bottom, margin.top]);


    // Tooltip element
    const tooltip = d3.select("#tooltip");

    barsvg.append("g")
    .selectAll("rect")
    .data(flattenedData)
    .join("rect")
    .attr("x", (d, index) => x(`${d.name}-${index}`))  
    .attr("y", d => y(d.value))
    .attr("height", d => y(0) - y(d.value))
    .attr("width", x.bandwidth())
    .attr("fill", d => d.color)  
    .on("mouseover", (event, d) => {
        tooltip.transition()
            .duration(200)
            .style("opacity", .9);
        tooltip.html(`Category: ${d.name}<br>Value: ${d.value.toFixed(2)}`)
            .style("left", (event.pageX + 5) + "px")
            .style("top", (event.pageY - 28) + "px");
    })
    .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 5) + "px")
            .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", () => {
        tooltip.transition()
            .duration(500)
            .style("opacity", 0);
    });


    barsvg.append("g")
        .call(d3.axisLeft(y))
        .attr("transform", `translate(${margin.left},0)`)
        barsvg.append("g")
        .call(d3.axisBottom(x).tickFormat((d) => {
            const match = d.match(/^(.*?)->\s*(.*?)-/); 
            return match ? `${match[1]}-> ${match[2]}` : d; 
        }))
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .selectAll("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -10)
        .attr("y", 0)
        .attr("dy", "0.35em")
        .style("text-anchor", "end")
    

    // Adding x-axis label
    barsvg.append("text")
        .attr("class", "x label")
        .attr("text-anchor", "end")
        .attr("x", width - margin.right + 100)
        .attr("y", height - margin.bottom + 60)  
        .attr("dy", "1em")
        .text(currentCategoricalColumn.replace(/-\d+$/, ""));

    // Adding y-axis label
    barsvg.append("text")
        .attr("class", "y label")
        .attr("text-anchor", "end")
        .attr("x", -margin.top )
        .attr("y", margin.top)  
        .attr("dy", "1em")
        .attr("transform", "rotate(-90)")
        .text(numericalColumn);
}


