import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Social 📱</h2>
                <p className="text-muted mb-4">
                    Manage your social media presence — create posts, publish to multiple platforms, and track replies.
                </p>

                <div className="row g-3">
                    <div className="col-md-4">
                        <div className="card border-primary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-paper-plane me-2 text-primary"></i>Posts</h5>
                                <p className="card-text text-muted">Create, schedule, and publish posts to Instagram, Facebook, X, TikTok, and YouTube.</p>
                                <Link className="btn btn-outline-primary btn-sm" href="/posts">Manage Posts</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-info h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-comments me-2 text-info"></i>Replies</h5>
                                <p className="card-text text-muted">View and manage comments and replies across all connected platforms.</p>
                                <Link className="btn btn-outline-info btn-sm" href="/replies">View Replies</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-secondary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-key me-2 text-secondary"></i>Accounts</h5>
                                <p className="card-text text-muted">Connect and configure API credentials for each social media platform.</p>
                                <Link className="btn btn-outline-secondary btn-sm" href="/accounts">Manage Accounts</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-dark h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-photo-film me-2 text-dark"></i>Media</h5>
                                <p className="card-text text-muted">Upload and manage images and videos for your social media posts.</p>
                                <Link className="btn btn-outline-dark btn-sm" href="/media">Media Library</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
