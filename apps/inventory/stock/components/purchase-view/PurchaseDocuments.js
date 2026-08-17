import StrapiImage from '@rutba/pos-shared/components/StrapiImage';

export default function PurchaseDocuments({ receipts, gallery }) {
    const hasReceipts = receipts && receipts.length > 0;
    const hasGallery = gallery && gallery.length > 0;

    if (!hasReceipts && !hasGallery) {
        return null;
    }

    return (
        <div style={{ marginBottom: '30px' }}>
            <h2 style={{ marginBottom: '15px', color: '#333' }}>Documents & Receipts</h2>
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                {hasReceipts && receipts.map((receipt, index) => (
                    <DocumentCard
                        key={`receipt-${index}`}
                        type="receipt"
                        item={receipt}
                        index={index}
                    />
                ))}

                {hasGallery && gallery.map((image, index) => (
                    <DocumentCard
                        key={`gallery-${index}`}
                        type="image"
                        item={image}
                        index={index}
                    />
                ))}
            </div>
        </div>
    );
}

function DocumentCard({ type, item, index }) {
    return (
        <div style={{
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            padding: '10px',
            textAlign: 'center',
            width: '120px'
        }}>
            {type === 'receipt' ? (
                <div style={{
                    width: '100px',
                    height: '100px',
                    background: '#f8f9fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    marginBottom: '8px'
                }}>
                    <i className="fas fa-file" style={{ fontSize: '24px', color: '#6c757d' }}></i>
                </div>
            ) : (
                <StrapiImage
                    media={item}
                    format="thumbnail"
                    maxWidth={100}
                    maxHeight={100}
                    imgProps={{ style: { borderRadius: '4px' } }}
                />
            )}
            <div style={{ fontSize: '12px', wordBreak: 'break-word' }}>
                {item.name || `${type === 'receipt' ? 'Receipt' : 'Image'} ${index + 1}`}
            </div>
        </div>
    );
}