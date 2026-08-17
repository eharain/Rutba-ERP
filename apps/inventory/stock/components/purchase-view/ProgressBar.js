export default function ProgressBar({ percentage }) {
    const getBarColor = () => {
        if (percentage === 100) return '#28a745';
        if (percentage > 0) return '#fd7e14';
        return '#6c757d';
    };

    return (
        <div style={{
            marginTop: '4px',
            background: '#e9ecef',
            borderRadius: '4px',
            height: '6px',
            overflow: 'hidden'
        }}>
            <div
                style={{
                    height: '100%',
                    background: getBarColor(),
                    width: `${percentage}%`,
                    transition: 'width 0.3s ease'
                }}
            />
        </div>
    );
}