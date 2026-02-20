import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba CMS ✏️</h2>
                <p className="text-muted mb-4">
                    Manage your website content — products, categories, brands, banners, and static pages.
                </p>

                <div className="row g-3">
                    <div className="col-md-4">
                        <div className="card border-primary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-box me-2 text-primary"></i>Products</h5>
                                <p className="card-text text-muted">Manage products displayed on the website — names, prices, images, and descriptions.</p>
                                <Link className="btn btn-outline-primary btn-sm" href="/products">Manage Products</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-info h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-tags me-2 text-info"></i>Categories</h5>
                                <p className="card-text text-muted">Organise products into categories for easy navigation.</p>
                                <Link className="btn btn-outline-info btn-sm" href="/categories">Manage Categories</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-secondary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-copyright me-2 text-secondary"></i>Brands</h5>
                                <p className="card-text text-muted">Manage brand listings with logos and descriptions.</p>
                                <Link className="btn btn-outline-secondary btn-sm" href="/brands">Manage Brands</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-success h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-layer-group me-2 text-success"></i>Product Groups</h5>
                                <p className="card-text text-muted">Curate featured product groups, banners, and homepage highlights.</p>
                                <Link className="btn btn-outline-success btn-sm" href="/product-groups">Manage Groups</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-warning h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-file-alt me-2 text-warning"></i>Pages</h5>
                                <p className="card-text text-muted">Create and edit static pages, blog posts, and announcements.</p>
                                <Link className="btn btn-outline-warning btn-sm" href="/pages">Manage Pages</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-dark h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-shopping-bag me-2 text-dark"></i>Orders</h5>
                                <p className="card-text text-muted">View and track web orders from customers.</p>
                                <Link className="btn btn-outline-dark btn-sm" href="/orders">View Orders</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
