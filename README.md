# Hierarchical-Data-Visualization
 
This is an automated visualization system which uses sentence transformers and hierarchical clustering to detect multiple hierarchies in the dataset. It then uses a custom machine learning model to predict the hierarchies from each of the resulting clusters. The predicted hierarchies are they visualized using drill up/drill down bar charts and treemaps along with supporting interactive structures.

---

## 🚀 How to Run the Project

This project uses [Poetry](https://python-poetry.org/) for dependency management.

### 🧰 Prerequisites

- Python 3.11 installed
- [Poetry](https://python-poetry.org/docs/#installation) installed
- Git
- A browser (e.g., Chrome, Firefox)

### 📦 Step 1: Clone the Repository

Start by cloning the repository to your local machine:

```bash
git clone [https://github.com/your-username/your-repo-name.git](https://github.com/Uppalapati-Vinay-Kumar/HierarchyViz.git)
cd HierarchyViz
```

### 📦 Step 2: Install Dependencies with Poetry

Once you're inside the project folder, install the required dependencies using Poetry:

```bash
poetry install
```

> **Note**: Poetry will automatically create a virtual environment for the project, so you don't need to worry about setting one up yourself.

---

### 📁 Step 3: Add the Model File

The `model1.joblib` file is too large to be hosted on GitHub. To proceed, download the model from the provided link and place it in the **same directory** as `server.py`.

👉 **[Download the model file here](https://drive.google.com/file/d/1cvhH8MsJt2-YKPdbs7mNE-dQML1Ib9c7/view?usp=sharing)**

> **Important**: The model file must be in the same folder as `server.py` to ensure everything works properly.

---

### 🖥️ Step 4: Start the Backend Server

Now that the dependencies are installed and the model file is in place, run the backend server with the following command:

```bash
poetry run python server.py
```

Keep this terminal running — the server will remain active as long as you leave it open.

---

### 🌐 Step 5: Open the Frontend in a Browser

Once the server is running, open `index.html` in your preferred web browser:

- Double-click on the `index.html` file, or
- Right-click → Open with → Browser

The frontend will automatically connect to the backend server and you can start using the system.

---

## 📎 Model File Download

Due to size limits, `model1.joblib` is not included in this repository.  
👉 **[Download the model file here](https://drive.google.com/file/d/1cvhH8MsJt2-YKPdbs7mNE-dQML1Ib9c7/view?usp=sharing)**
---

## ## 📋 License

This project is licensed under the [Apache 2.0 License](https://opensource.org/licenses/Apache-2.0) — see the [LICENSE](LICENSE) file for details.

---

## 📝 Acknowledgements

- Special thanks to my advisor for their guidance and support throughout this project.

---

## ✅ You're all set!

If everything is configured properly, the system should now be live and usable through your browser.
