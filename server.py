
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from scipy.cluster.hierarchy import linkage, fcluster
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import io
import joblib

app = Flask(__name__)
CORS(app) 

# Loadin the trained machine learning model
model_file_path = "model1.joblib"
ml_model = joblib.load(model_file_path)
print("ML Model loaded from:", model_file_path)

# Loading the sentence transformer model
clustering_model = SentenceTransformer('all-mpnet-base-v2')

def expand_columns(df):
    """Expands columns with comma-separated values into separate columns."""
    expanded_df = df.copy()
    for col in expanded_df.columns:
        if expanded_df[col].astype(str).str.contains(',', na=False).any():
            expanded_cols = expanded_df[col].str.split(',', expand=True)
            expanded_cols.columns = [f"{col}_{i+1}" for i in range(expanded_cols.shape[1])]
            expanded_df = expanded_df.drop(col, axis=1).join(expanded_cols)
    return expanded_df

def exclude_datetime_columns(df):
    """Removes datetime columns from the dataset with explicit format handling."""
    datetime_columns = df.columns[df.apply(pd.to_datetime, errors='coerce').notnull().any()]
    df = df.drop(columns=datetime_columns)
    print(f"Excluded datetime columns: {datetime_columns}")
    return df


@app.route('/process_csv', methods=['POST'])
def process_csv():
    """Receives CSV data from JavaScript, processes it, and returns sorted hierarchy clusters and expanded CSV."""
    try:
        file_content = request.files['file'].read().decode('utf-8')
        df = pd.read_csv(io.StringIO(file_content))
        
        expanded_df = expand_columns(df)

        expanded_data = expanded_df.to_dict(orient="records") 
        columns_list = list(expanded_df.columns)  
        non_datetime_df = exclude_datetime_columns(expanded_df)

        print(non_datetime_df.dtypes)

        non_numeric_df = non_datetime_df.select_dtypes(exclude=['int64', 'float64'])
        column_names = list(non_numeric_df.columns)

        embeddings = clustering_model.encode(column_names)
        similarity_matrix = cosine_similarity(embeddings)

        # Performing hierarchical clustering
        Z = linkage(1 - similarity_matrix, 'ward')
        optimal_threshold = float(request.form.get('threshold', 1.5))
        clusters = fcluster(Z, optimal_threshold, criterion='distance')

        # Create a dictionary of clusters
        cluster_dict = {}
        for i, cluster_id in enumerate(clusters):
            cluster_id = int(cluster_id)  
            if cluster_id not in cluster_dict:
                cluster_dict[cluster_id] = []
            cluster_dict[cluster_id].append(column_names[i])
        
        # Print out the clusters
        print("\nClusters formed at threshold :", optimal_threshold)
        for cluster_id, members in cluster_dict.items():
            print(f"Cluster {cluster_id}: {', '.join(members)}")

        predicted_positions = {}

        for cluster_id, cluster_columns in cluster_dict.items():
            if len(cluster_columns) == 1:
                print(f"Skipping cluster {cluster_id} with only one column: {', '.join(cluster_columns)}")
                continue 

            if len(cluster_columns) > 9:
                print(f"⚠️ Skipping cluster {cluster_id} as it has more than 9 columns: {', '.join(cluster_columns)}")
                continue

            # Extract features for the current cluster columns
            features = {}
            for i, col in enumerate(cluster_columns):
                features[f'col_{i}_unique_count'] = non_numeric_df[col].nunique()  
                features[f'col_{i}_missing_vals'] = non_numeric_df[col].isnull().sum() 
                numerical_columns = df.select_dtypes(include=['number']).columns
                largest_sum_col = df[numerical_columns].sum().idxmax()
                largest_sum_value = df[largest_sum_col].sum()
                unique_values_count = expanded_df[col].nunique()
                
                if unique_values_count > 0:
                    ratio = largest_sum_value / unique_values_count
                    features[f'col_{i}_ratio'] = ratio
                else:
                    features[f'col_{i}_ratio'] = 0  

            # Ensuring we have the expected number of features
            max_expected_columns = 9
            for j in range(int(len(features)/3), max_expected_columns):
                features[f'col_{j}_unique_count'] = 0
                features[f'col_{j}_missing_vals'] = 0
                features[f'col_{j}_ratio'] = 0

            features_df = pd.DataFrame([features])
            features_df.fillna(0, inplace=True)
            print(features_df)
            predictions = ml_model.predict(features_df)
            predicted_positions[cluster_id] = {
                cluster_columns[i]: int(predictions[0][i]) for i in range(len(cluster_columns))
            }

        # # Step 7: Sort columns within each cluster by predicted position
        # sorted_columns = {}
        # for cluster_id, positions in predicted_positions.items():
        #     sorted_columns[cluster_id] = sorted(positions, key=positions.get)

        # print("\nPredicted Column Hierarchy:", sorted_columns)  # Debugging output

        sorted_columns = {}
        for cluster_id, cluster_columns in cluster_dict.items():
            if len(cluster_columns) > 1:
                unique_counts = {col: non_numeric_df[col].nunique() for col in cluster_columns}
                sorted_by_unique = sorted(unique_counts, key=unique_counts.get)
                sorted_columns[cluster_id] = sorted_by_unique
            else:
                print("cluster has been omitted since it only has one column")

        print("\nColumn Hierarchy:", sorted_columns)

        return jsonify({
            "clusters": sorted_columns,
            "threshold": optimal_threshold,
        })
    
    except Exception as e:
        return jsonify({"error": str(e)})

if __name__ == '__main__':
    print("Starting Flask server...")
    app.run(debug=True)
